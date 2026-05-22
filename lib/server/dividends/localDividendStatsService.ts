import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type {
  AssetDividendGrowth,
  DividendStats,
  TotalReturnAsset,
  YieldOnCostAsset,
} from "@/types/dividend";

export type LocalDividendStatsFilters = {
  assetId?: string;
  startDate?: Date;
  endDate?: Date;
  today?: Date;
};

export type LocalDividendStatsResponse = {
  success: true;
  stats: {
    period: Pick<DividendStats, "totalGross" | "totalTax" | "totalNet" | "count">;
    allTime: Pick<DividendStats, "totalGross" | "totalTax" | "totalNet" | "count">;
    averageYield: number;
    upcomingTotal: number;
    byAsset: Array<{
      assetTicker: string;
      assetName: string;
      totalNet: number;
      count: number;
    }>;
    byYear: Array<{
      year: number;
      totalGross: number;
      totalTax: number;
      totalNet: number;
    }>;
    byMonth: Array<{
      month: string;
      totalNet: number;
    }>;
    portfolioYieldOnCost?: number;
    totalCostBasis?: number;
    yieldOnCostAssets?: YieldOnCostAsset[];
    totalReturnAssets?: TotalReturnAsset[];
    realizedInvestmentSummary?: DividendStats["realizedInvestmentSummary"];
    dividendGrowthData?: {
      byAsset: AssetDividendGrowth[];
      portfolioMedianGrowth?: number;
      portfolioAvgGrowth?: number;
    };
  };
  period:
    | "all_time"
    | {
        startDate: string;
        endDate: string;
      };
};

type DividendRow = Awaited<ReturnType<typeof prisma.dividend.findMany>>[number];
type AssetRow = Awaited<ReturnType<typeof prisma.asset.findMany>>[number];
type InvestmentOperationRow = Awaited<
  ReturnType<typeof prisma.investmentOperation.findMany>
>[number];

export async function getLocalDividendStats(
  userId: string,
  filters: LocalDividendStatsFilters = {}
): Promise<LocalDividendStatsResponse> {
  const today = startOfDay(filters.today ?? new Date());
  const [dividends, assets, operations] = await Promise.all([
    prisma.dividend.findMany({
      where: buildDividendWhere(userId, filters.assetId),
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
    }),
    prisma.asset.findMany({
      where: { userId },
    }),
    prisma.investmentOperation.findMany({
      where: buildInvestmentOperationWhere(userId, filters.assetId),
    }),
  ]);

  const assetMap = new Map(assets.map((asset) => [asset.id, mapAsset(asset)]));
  const scopedDividends = dividends.filter(
    (dividend) => !filters.assetId || dividend.assetId === filters.assetId
  );
  const paidDividends = scopedDividends.filter((dividend) => dividend.paymentDate <= today);
  const periodDividends = paidDividends.filter((dividend) =>
    isInsideDateRange(dividend.paymentDate, filters.startDate, filters.endDate)
  );

  const periodStats = calculateStats(periodDividends);
  const allTimeStats = calculateStats(paidDividends);
  const activeUpcomingDividends = scopedDividends.filter((dividend) => {
    const asset = assetMap.get(dividend.assetId);
    return dividend.paymentDate > today && Boolean(asset && asset.quantity > 0);
  });

  const byAsset = buildByAsset(periodStats);
  const byYear = buildByYear(periodDividends);
  const byMonth = buildByMonth(periodDividends);
  const averageYield = calculateAverageYield(paidDividends, assetMap, today);
  const yoc = calculateYieldOnCost(paidDividends, assetMap, today);
  const totalReturnAssets = calculateTotalReturnAssets(paidDividends, assetMap);
  const scopedOperations = operations.filter(
    (operation) => !filters.assetId || operation.assetId === filters.assetId
  );
  const realizedInvestmentSummary = calculateRealizedSummary(scopedOperations);
  const dividendGrowthData = calculateDividendGrowth(paidDividends, assetMap);

  return {
    success: true,
    stats: {
      period: summarizeStats(periodStats),
      allTime: summarizeStats(allTimeStats),
      averageYield,
      upcomingTotal: activeUpcomingDividends.reduce(
        (sum, dividend) => sum + dividend.netAmount,
        0
      ),
      byAsset,
      byYear,
      byMonth,
      ...yoc,
      ...(totalReturnAssets.length > 0 && { totalReturnAssets }),
      ...(realizedInvestmentSummary.sellsCount > 0 && { realizedInvestmentSummary }),
      ...(dividendGrowthData.byAsset.length > 0 && { dividendGrowthData }),
    },
    period: buildPeriodResponse(filters.startDate, filters.endDate),
  };
}

function buildDividendWhere(
  userId: string,
  assetId?: string
): Prisma.DividendWhereInput {
  return assetId ? { userId, assetId } : { userId };
}

function buildInvestmentOperationWhere(
  userId: string,
  assetId?: string
): Prisma.InvestmentOperationWhereInput {
  return {
    userId,
    ...(assetId && { assetId }),
    type: { in: ["sell", "withdrawal"] },
  };
}

function calculateStats(dividends: DividendRow[]): DividendStats {
  const stats: DividendStats = {
    totalGross: 0,
    totalTax: 0,
    totalNet: 0,
    count: dividends.length,
    byAsset: {},
    byType: {
      ordinary: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
      extraordinary: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
      interim: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
      final: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
      coupon: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
      finalPremium: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
    },
  };

  dividends.forEach((dividend) => {
    stats.totalGross += dividend.grossAmount;
    stats.totalTax += dividend.taxAmount;
    stats.totalNet += dividend.netAmount;

    stats.byAsset[dividend.assetId] ??= {
      assetTicker: dividend.assetTicker,
      assetName: dividend.assetName,
      totalGross: 0,
      totalTax: 0,
      totalNet: 0,
      count: 0,
    };
    stats.byAsset[dividend.assetId].totalGross += dividend.grossAmount;
    stats.byAsset[dividend.assetId].totalTax += dividend.taxAmount;
    stats.byAsset[dividend.assetId].totalNet += dividend.netAmount;
    stats.byAsset[dividend.assetId].count += 1;

    const byType = stats.byType[dividend.dividendType as keyof DividendStats["byType"]];
    if (byType) {
      byType.totalGross += dividend.grossAmount;
      byType.totalTax += dividend.taxAmount;
      byType.totalNet += dividend.netAmount;
      byType.count += 1;
    }
  });

  return stats;
}

function summarizeStats(stats: DividendStats) {
  return {
    totalGross: stats.totalGross,
    totalTax: stats.totalTax,
    totalNet: stats.totalNet,
    count: stats.count,
  };
}

function buildByAsset(stats: DividendStats) {
  return Object.values(stats.byAsset)
    .map((asset) => ({
      assetTicker: asset.assetTicker,
      assetName: asset.assetName,
      totalNet: asset.totalNet,
      count: asset.count,
    }))
    .sort((a, b) => b.totalNet - a.totalNet);
}

function buildByYear(dividends: DividendRow[]) {
  const byYear = new Map<number, { totalGross: number; totalTax: number; totalNet: number }>();

  dividends.forEach((dividend) => {
    const year = dividend.paymentDate.getFullYear();
    byYear.set(year, byYear.get(year) ?? { totalGross: 0, totalTax: 0, totalNet: 0 });
    const yearData = byYear.get(year)!;
    yearData.totalGross += dividend.grossAmount;
    yearData.totalTax += dividend.taxAmount;
    yearData.totalNet += dividend.netAmount;
  });

  return Array.from(byYear.entries())
    .map(([year, data]) => ({ year, ...data }))
    .sort((a, b) => a.year - b.year);
}

function buildByMonth(dividends: DividendRow[]) {
  const byMonth = new Map<string, number>();

  dividends.forEach((dividend) => {
    const month = `${dividend.paymentDate.getFullYear()}-${String(
      dividend.paymentDate.getMonth() + 1
    ).padStart(2, "0")}`;
    byMonth.set(month, (byMonth.get(month) ?? 0) + dividend.netAmount);
  });

  return Array.from(byMonth.entries())
    .map(([month, totalNet]) => ({ month, totalNet }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function calculateAverageYield(
  paidDividends: DividendRow[],
  assetMap: Map<string, LocalAsset>,
  today: Date
) {
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const ttmDividends = paidDividends.filter(
    (dividend) => dividend.paymentDate >= twelveMonthsAgo && dividend.paymentDate <= today
  );
  const ttmTotalGross = ttmDividends.reduce(
    (sum, dividend) => sum + dividend.grossAmount,
    0
  );
  const assetIdsWithDividends = new Set(ttmDividends.map((dividend) => dividend.assetId));
  const portfolioValue = Array.from(assetMap.values())
    .filter((asset) => assetIdsWithDividends.has(asset.id) && asset.quantity > 0)
    .reduce((sum, asset) => sum + asset.currentPrice * asset.quantity, 0);

  return portfolioValue > 0 && ttmTotalGross > 0
    ? (ttmTotalGross / portfolioValue) * 100
    : 0;
}

function calculateYieldOnCost(
  paidDividends: DividendRow[],
  assetMap: Map<string, LocalAsset>,
  today: Date
): Pick<
  LocalDividendStatsResponse["stats"],
  "portfolioYieldOnCost" | "totalCostBasis" | "yieldOnCostAssets"
> {
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const ttmByAsset = new Map<string, number>();

  paidDividends
    .filter((dividend) => dividend.paymentDate >= twelveMonthsAgo && dividend.paymentDate <= today)
    .forEach((dividend) => {
      ttmByAsset.set(
        dividend.assetId,
        (ttmByAsset.get(dividend.assetId) ?? 0) + dividend.grossAmount
      );
    });

  const yieldOnCostAssets: YieldOnCostAsset[] = [];
  assetMap.forEach((asset) => {
    const ttmGrossDividends = ttmByAsset.get(asset.id) ?? 0;
    if (!asset.averageCost || asset.averageCost <= 0 || asset.quantity <= 0 || ttmGrossDividends <= 0) {
      return;
    }

    const costBasis = asset.quantity * asset.averageCost;
    const currentValue = asset.quantity * asset.currentPrice;
    const yocPercentage = (ttmGrossDividends / costBasis) * 100;
    const currentYieldPercentage = currentValue > 0
      ? (ttmGrossDividends / currentValue) * 100
      : 0;

    yieldOnCostAssets.push({
      assetId: asset.id,
      assetTicker: asset.ticker,
      assetName: asset.name,
      quantity: asset.quantity,
      averageCost: asset.averageCost,
      currentPrice: asset.currentPrice,
      ttmGrossDividends,
      yocPercentage,
      currentYieldPercentage,
      difference: yocPercentage - currentYieldPercentage,
    });
  });

  if (yieldOnCostAssets.length === 0) {
    return {};
  }

  yieldOnCostAssets.sort((a, b) => b.yocPercentage - a.yocPercentage);
  const totalCostBasis = yieldOnCostAssets.reduce(
    (sum, asset) => sum + asset.quantity * asset.averageCost,
    0
  );
  const ttmDividends = yieldOnCostAssets.reduce(
    (sum, asset) => sum + asset.ttmGrossDividends,
    0
  );

  return {
    portfolioYieldOnCost: totalCostBasis > 0 ? (ttmDividends / totalCostBasis) * 100 : undefined,
    totalCostBasis,
    yieldOnCostAssets,
  };
}

function calculateTotalReturnAssets(
  paidDividends: DividendRow[],
  assetMap: Map<string, LocalAsset>
): TotalReturnAsset[] {
  const dividendsByAsset = new Map<string, DividendRow[]>();
  paidDividends.forEach((dividend) => {
    dividendsByAsset.set(dividend.assetId, [
      ...(dividendsByAsset.get(dividend.assetId) ?? []),
      dividend,
    ]);
  });

  return Array.from(assetMap.values())
    .filter((asset) => {
      const allTimeNet = (dividendsByAsset.get(asset.id) ?? []).reduce(
        (sum, dividend) => sum + (dividend.netAmountEur ?? dividend.netAmount),
        0
      );
      return Boolean(asset.averageCost && asset.averageCost > 0 && asset.quantity > 0 && allTimeNet > 0);
    })
    .map((asset) => {
      const assetDividends = dividendsByAsset.get(asset.id) ?? [];
      const costBasis = asset.quantity * asset.averageCost!;
      const currentValue = asset.quantity * asset.currentPrice;
      const allTimeNetDividends = assetDividends.reduce(
        (sum, dividend) => sum + (dividend.netAmountEur ?? dividend.netAmount),
        0
      );
      const capitalGainAbsolute = currentValue - costBasis;
      const capitalGainPercentage = (capitalGainAbsolute / costBasis) * 100;
      const dividendReturnPercentage = assetDividends.reduce((sum, dividend) => {
        const effectiveCostPerShare = dividend.costPerShare ?? asset.averageCost!;
        const costBasisAtTime = dividend.quantity * effectiveCostPerShare;
        return costBasisAtTime > 0
          ? sum + ((dividend.netAmountEur ?? dividend.netAmount) / costBasisAtTime) * 100
          : sum;
      }, 0);

      return {
        assetId: asset.id,
        assetTicker: asset.ticker,
        assetName: asset.name,
        quantity: asset.quantity,
        averageCost: asset.averageCost!,
        currentPrice: asset.currentPrice,
        costBasis,
        currentValue,
        allTimeNetDividends,
        capitalGainAbsolute,
        capitalGainPercentage,
        dividendReturnPercentage,
        totalReturnPercentage: capitalGainPercentage + dividendReturnPercentage,
      };
    })
    .sort((a, b) => b.totalReturnPercentage - a.totalReturnPercentage);
}

function calculateRealizedSummary(
  operations: InvestmentOperationRow[]
): NonNullable<DividendStats["realizedInvestmentSummary"]> {
  const byAsset = new Map<string, NonNullable<DividendStats["realizedInvestmentSummary"]>["byAsset"][number]>();

  operations.forEach((operation) => {
    const realizedGain = operation.realizedGain ?? 0;
    const realizedTaxes = operation.realizedGainTax ?? operation.taxes ?? 0;
    const current = byAsset.get(operation.assetId) ?? {
      assetId: operation.assetId,
      assetName: operation.assetName,
      assetTicker: operation.assetTicker,
      realizedGain: 0,
      realizedTaxes: 0,
      netRealizedGain: 0,
      sellsCount: 0,
    };

    current.realizedGain += realizedGain;
    current.realizedTaxes += realizedTaxes;
    current.netRealizedGain += realizedGain - realizedTaxes;
    current.sellsCount += 1;
    byAsset.set(operation.assetId, current);
  });

  const byAssetList = Array.from(byAsset.values())
    .sort((a, b) => b.netRealizedGain - a.netRealizedGain);

  return {
    totalRealizedGain: byAssetList.reduce((sum, item) => sum + item.realizedGain, 0),
    totalRealizedTaxes: byAssetList.reduce((sum, item) => sum + item.realizedTaxes, 0),
    totalNetRealizedGain: byAssetList.reduce((sum, item) => sum + item.netRealizedGain, 0),
    sellsCount: byAssetList.reduce((sum, item) => sum + item.sellsCount, 0),
    byAsset: byAssetList,
  };
}

function calculateDividendGrowth(
  paidDividends: DividendRow[],
  assetMap: Map<string, LocalAsset>
): NonNullable<LocalDividendStatsResponse["stats"]["dividendGrowthData"]> {
  const dpsByAsset = new Map<string, Map<number, number>>();

  paidDividends
    .filter((dividend) => !["coupon", "finalPremium"].includes(dividend.dividendType))
    .forEach((dividend) => {
      const year = dividend.paymentDate.getFullYear();
      dpsByAsset.set(dividend.assetId, dpsByAsset.get(dividend.assetId) ?? new Map());
      const yearMap = dpsByAsset.get(dividend.assetId)!;
      yearMap.set(year, (yearMap.get(year) ?? 0) + dividend.dividendPerShare);
    });

  const byAsset: AssetDividendGrowth[] = [];
  dpsByAsset.forEach((yearMap, assetId) => {
    const asset = assetMap.get(assetId);
    if (!asset || asset.quantity <= 0) {
      return;
    }

    const yearlyDps = Array.from(yearMap.entries())
      .map(([year, totalDps]) => ({ year, totalDps }))
      .sort((a, b) => a.year - b.year);
    const yoyGrowth: Record<number, number> = {};
    for (let index = 1; index < yearlyDps.length; index += 1) {
      const previous = yearlyDps[index - 1].totalDps;
      if (previous > 0) {
        yoyGrowth[yearlyDps[index].year] =
          ((yearlyDps[index].totalDps - previous) / previous) * 100;
      }
    }
    const first = yearlyDps[0];
    const last = yearlyDps[yearlyDps.length - 1];
    const yearSpan = last.year - first.year;
    const cagr = yearSpan > 0 && first.totalDps > 0
      ? (Math.pow(last.totalDps / first.totalDps, 1 / yearSpan) - 1) * 100
      : undefined;

    byAsset.push({
      assetId,
      assetTicker: asset.ticker,
      assetName: asset.name,
      currency: "EUR",
      yearlyDps,
      yoyGrowth,
      cagr,
      latestYoyGrowth: yearlyDps.length >= 2 ? yoyGrowth[last.year] : undefined,
    });
  });

  byAsset.sort((a, b) => a.assetName.localeCompare(b.assetName));
  const validGrowths = byAsset
    .map((asset) => asset.latestYoyGrowth)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);

  return {
    byAsset,
    portfolioMedianGrowth: median(validGrowths),
    portfolioAvgGrowth: validGrowths.length > 0
      ? validGrowths.reduce((sum, value) => sum + value, 0) / validGrowths.length
      : undefined,
  };
}

type LocalAsset = {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  currentPrice: number;
  averageCost?: number;
};

function mapAsset(asset: AssetRow): LocalAsset {
  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  return {
    id: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    quantity: asset.quantity,
    currentPrice: asset.currentPriceEur ?? asset.currentPrice,
    averageCost: typeof metadata.averageCost === "number" ? metadata.averageCost : undefined,
  };
}

function isInsideDateRange(date: Date, startDate?: Date, endDate?: Date) {
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

function buildPeriodResponse(startDate?: Date, endDate?: Date): LocalDividendStatsResponse["period"] {
  if (!startDate && !endDate) {
    return "all_time";
  }

  return {
    startDate: (startDate ?? new Date(0)).toISOString(),
    endDate: (endDate ?? new Date("9999-12-31T00:00:00.000Z")).toISOString(),
  };
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

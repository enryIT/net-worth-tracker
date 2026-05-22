import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  DASHBOARD_OVERVIEW_SOURCE_VERSION,
  DASHBOARD_OVERVIEW_SUMMARY_TTL_MS,
} from "@/lib/services/dashboardOverviewConstants";
import { getItalyMonthYear } from "@/lib/utils/dateHelpers";
import type {
  DashboardOverviewExpenseStats,
  DashboardOverviewPayload,
} from "@/types/dashboardOverview";

type DashboardPayloadWithoutFreshness = Omit<DashboardOverviewPayload, "freshness">;

type AssetRow = {
  id: string;
  ticker: string;
  name: string;
  type: string;
  assetClass: string;
  subCategory: string | null;
  currency: string;
  quantity: number;
  currentPrice: number;
  currentPriceEur: number | null;
  metadata: Prisma.JsonValue;
};

type SnapshotRow = {
  year: number;
  month: number;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
};

type ExpenseRow = {
  type: string;
  amount: number;
};

type SummaryRow = {
  payload: Prisma.JsonValue | null;
  sourceVersion: number;
  computedAt: Date | null;
  invalidatedAt: Date | null;
  updatedAt: Date;
};

type AssetWithMetadata = AssetRow & {
  metadataRecord: Record<string, unknown>;
};

export async function getLocalDashboardOverview(
  userId: string
): Promise<DashboardOverviewPayload> {
  const summary = await prisma.dashboardOverviewSummary.findUnique({
    where: { userId },
  });

  if (summary && !isSummaryStale(summary)) {
    return toResponsePayload(
      summary.payload as unknown as DashboardPayloadWithoutFreshness,
      {
        source: "materialized_summary",
        updatedAt: summary.updatedAt,
        computedAt: summary.computedAt ?? summary.updatedAt,
        stale: false,
      }
    );
  }

  return recomputeLocalDashboardOverview(userId);
}

async function recomputeLocalDashboardOverview(
  userId: string
): Promise<DashboardOverviewPayload> {
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const [assets, snapshots, settingsRow, currentExpenses, previousExpenses] =
    await Promise.all([
      prisma.asset.findMany({ where: { userId } }),
      prisma.monthlySnapshot.findMany({
        where: { userId },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      }),
      prisma.userSetting.findUnique({ where: { userId } }),
      prisma.expense.findMany({
        where: {
          userId,
          date: buildMonthRange(currentYear, currentMonth),
        },
      }),
      prisma.expense.findMany({
        where: {
          userId,
          date: buildMonthRange(previousYear, previousMonth),
        },
      }),
    ]);

  const settings = isRecord(settingsRow?.data) ? settingsRow.data : {};
  const payload = buildOverviewPayload(
    assets.map((asset) => ({
      ...asset,
      metadataRecord: isRecord(asset.metadata) ? asset.metadata : {},
    })),
    snapshots,
    settings,
    buildExpenseStats(currentExpenses, previousExpenses),
    currentYear,
    currentMonth
  );
  const now = new Date();

  await prisma.dashboardOverviewSummary.upsert({
    where: { userId },
    create: {
      userId,
      payload: payload as unknown as Prisma.InputJsonValue,
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      computedAt: now,
      invalidatedAt: null,
      lastInvalidationReason: null,
    },
    update: {
      payload: payload as unknown as Prisma.InputJsonValue,
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      computedAt: now,
      invalidatedAt: null,
      lastInvalidationReason: null,
    },
  });

  return toResponsePayload(payload, {
    source: "live_recompute",
    updatedAt: now,
    computedAt: now,
    stale: false,
  });
}

function buildOverviewPayload(
  assets: AssetWithMetadata[],
  snapshots: SnapshotRow[],
  settings: Record<string, unknown>,
  expenseStats: DashboardOverviewExpenseStats,
  currentYear: number,
  currentMonth: number
): DashboardPayloadWithoutFreshness {
  const currentMonthSnapshot =
    snapshots.find(
      (snapshot) => snapshot.year === currentYear && snapshot.month === currentMonth
    ) ?? null;
  const totalValue = sumAssetValues(assets);
  const liquidNetWorth = sumAssetValues(assets.filter(isLiquidAsset));
  const illiquidNetWorth = sumAssetValues(assets.filter((asset) => !isLiquidAsset(asset)));
  const estimatedTaxes = sumEstimatedTaxes(assets);
  const liquidEstimatedTaxes = sumEstimatedTaxes(assets.filter(isLiquidAsset));
  const portfolioTER = calculatePortfolioWeightedTER(assets);
  const annualStampDuty = getBooleanSetting(settings, "stampDutyEnabled")
    ? calculateStampDuty(
        assets,
        getNumberSetting(settings, "stampDutyRate"),
        getStringSetting(settings, "checkingAccountSubCategory")
      )
    : 0;
  const currentNetWorth = currentMonthSnapshot
    ? currentMonthSnapshot.totalNetWorth
    : totalValue;

  return {
    metrics: {
      totalValue,
      liquidNetWorth,
      illiquidNetWorth,
      netTotal: totalValue - estimatedTaxes,
      liquidNetTotal: liquidNetWorth - liquidEstimatedTaxes,
      unrealizedGains: sumUnrealizedGains(assets),
      estimatedTaxes,
      portfolioTER,
      annualPortfolioCost: calculateAnnualPortfolioCost(assets, portfolioTER),
      annualStampDuty,
    },
    variations: {
      monthly: calculateMonthlyVariation(currentNetWorth, snapshots, currentMonthSnapshot),
      yearly: calculateYearlyVariation(currentNetWorth, snapshots, currentYear, currentMonth),
    },
    expenseStats,
    charts: {
      assetClassData: buildAssetClassChart(assets, totalValue),
      assetData: buildAssetChart(assets, totalValue),
      liquidityData: [
        {
          name: "Liquido",
          value: liquidNetWorth,
          percentage: totalValue > 0 ? (liquidNetWorth / totalValue) * 100 : 0,
          color: "#10b981",
        },
        {
          name: "Illiquido",
          value: illiquidNetWorth,
          percentage: totalValue > 0 ? (illiquidNetWorth / totalValue) * 100 : 0,
          color: "#f59e0b",
        },
      ],
    },
    flags: {
      assetCount: assets.filter((asset) => asset.quantity > 0).length,
      hasCostBasisTracking: assets.some((asset) => getNumberMetadata(asset, "averageCost") > 0),
      hasTERTracking: assets.some((asset) => getNumberMetadata(asset, "totalExpenseRatio") > 0),
      hasStampDuty: annualStampDuty > 0,
      currentMonthSnapshotExists: currentMonthSnapshot !== null,
    },
  };
}

function isSummaryStale(summary: SummaryRow): boolean {
  if (!summary.payload) {
    return true;
  }

  if (summary.sourceVersion !== DASHBOARD_OVERVIEW_SOURCE_VERSION) {
    return true;
  }

  if (summary.invalidatedAt) {
    return true;
  }

  return Date.now() - summary.updatedAt.getTime() > DASHBOARD_OVERVIEW_SUMMARY_TTL_MS;
}

function toResponsePayload(
  payload: DashboardPayloadWithoutFreshness,
  metadata: {
    source: DashboardOverviewPayload["freshness"]["source"];
    updatedAt: Date;
    computedAt: Date;
    stale: boolean;
  }
): DashboardOverviewPayload {
  return {
    ...payload,
    freshness: {
      source: metadata.source,
      updatedAt: metadata.updatedAt.toISOString(),
      computedAt: metadata.computedAt.toISOString(),
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      stale: metadata.stale,
    },
  };
}

function buildExpenseStats(
  currentExpenses: ExpenseRow[],
  previousExpenses: ExpenseRow[]
): DashboardOverviewExpenseStats {
  const currentMonth = summarizeExpenses(currentExpenses);
  const previousMonth = summarizeExpenses(previousExpenses);

  return {
    currentMonth,
    previousMonth,
    delta: {
      income: previousMonth.income > 0
        ? ((currentMonth.income - previousMonth.income) / previousMonth.income) * 100
        : 0,
      expenses: previousMonth.expenses > 0
        ? ((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100
        : 0,
      net: previousMonth.net !== 0
        ? ((currentMonth.net - previousMonth.net) / Math.abs(previousMonth.net)) * 100
        : 0,
    },
  };
}

function summarizeExpenses(expenses: ExpenseRow[]) {
  return expenses.reduce(
    (summary, expense) => {
      if (expense.type === "income") {
        summary.income += expense.amount;
      } else {
        summary.expenses += Math.abs(expense.amount);
      }

      summary.net = summary.income - summary.expenses;
      return summary;
    },
    { income: 0, expenses: 0, net: 0 }
  );
}

function calculateAssetValue(asset: AssetWithMetadata): number {
  const fallbackPrice = asset.currency === "GBp"
    ? asset.currentPrice / 100
    : asset.currentPrice;
  const price = asset.currency.toUpperCase() !== "EUR" && asset.currentPriceEur !== null
    ? asset.currentPriceEur
    : fallbackPrice;
  const baseValue = asset.quantity * price;
  const outstandingDebt = getNumberMetadata(asset, "outstandingDebt");

  if (asset.assetClass === "realestate" && outstandingDebt > 0) {
    return Math.max(0, baseValue - outstandingDebt);
  }

  return baseValue;
}

function isLiquidAsset(asset: AssetWithMetadata): boolean {
  const metadataValue = asset.metadataRecord.isLiquid;

  if (typeof metadataValue === "boolean") {
    return metadataValue;
  }

  return (
    asset.assetClass !== "realestate" &&
    asset.type !== "pensionfund" &&
    asset.subCategory !== "Private Equity"
  );
}

function calculateUnrealizedGains(asset: AssetWithMetadata): number {
  const averageCost = getNumberMetadata(asset, "averageCost");

  if (averageCost <= 0) {
    return 0;
  }

  return calculateAssetValue(asset) - asset.quantity * averageCost;
}

function calculateEstimatedTaxes(asset: AssetWithMetadata): number {
  const gains = calculateUnrealizedGains(asset);
  const taxRate = getNumberMetadata(asset, "taxRate");

  return gains > 0 && taxRate > 0 ? gains * (taxRate / 100) : 0;
}

function calculatePortfolioWeightedTER(assets: AssetWithMetadata[]): number {
  const assetsWithTer = assets.filter((asset) => getNumberMetadata(asset, "totalExpenseRatio") > 0);
  const totalValueWithTer = sumAssetValues(assetsWithTer);

  if (totalValueWithTer === 0) {
    return 0;
  }

  return assetsWithTer.reduce(
    (sum, asset) => sum + getNumberMetadata(asset, "totalExpenseRatio") * calculateAssetValue(asset),
    0
  ) / totalValueWithTer;
}

function calculateAnnualPortfolioCost(
  assets: AssetWithMetadata[],
  portfolioTER: number
): number {
  if (portfolioTER === 0) {
    return 0;
  }

  return sumAssetValues(
    assets.filter((asset) => getNumberMetadata(asset, "totalExpenseRatio") > 0)
  ) * (portfolioTER / 100);
}

function calculateStampDuty(
  assets: AssetWithMetadata[],
  stampDutyRate: number,
  checkingAccountSubCategory?: string
): number {
  if (stampDutyRate <= 0) {
    return 0;
  }

  return assets
    .filter((asset) => asset.quantity > 0)
    .filter((asset) => asset.metadataRecord.stampDutyExempt !== true)
    .reduce((total, asset) => {
      const value = calculateAssetValue(asset);

      if (
        asset.assetClass === "cash" &&
        checkingAccountSubCategory &&
        asset.subCategory === checkingAccountSubCategory
      ) {
        return value > 5000 ? total + value * (stampDutyRate / 100) : total;
      }

      return total + value * (stampDutyRate / 100);
    }, 0);
}

function calculateMonthlyVariation(
  currentNetWorth: number,
  snapshots: SnapshotRow[],
  currentMonthSnapshot: SnapshotRow | null
) {
  const previousSnapshot = currentMonthSnapshot
    ? snapshots.at(-2) ?? null
    : snapshots.at(-1) ?? null;

  if (!previousSnapshot) {
    return null;
  }

  return {
    value: currentNetWorth - previousSnapshot.totalNetWorth,
    percentage: previousSnapshot.totalNetWorth !== 0
      ? ((currentNetWorth - previousSnapshot.totalNetWorth) / previousSnapshot.totalNetWorth) * 100
      : 0,
  };
}

function calculateYearlyVariation(
  currentNetWorth: number,
  snapshots: SnapshotRow[],
  currentYear: number,
  currentMonth: number
) {
  const previousYearSnapshot = snapshots.find(
    (snapshot) => snapshot.year === currentYear - 1 && snapshot.month === currentMonth
  );

  if (!previousYearSnapshot) {
    return null;
  }

  return {
    value: currentNetWorth - previousYearSnapshot.totalNetWorth,
    percentage: previousYearSnapshot.totalNetWorth !== 0
      ? ((currentNetWorth - previousYearSnapshot.totalNetWorth) / previousYearSnapshot.totalNetWorth) * 100
      : 0,
  };
}

function buildAssetClassChart(assets: AssetWithMetadata[], totalValue: number) {
  if (totalValue === 0) {
    return [];
  }

  const byAssetClass = new Map<string, number>();
  for (const asset of assets) {
    byAssetClass.set(
      asset.assetClass,
      (byAssetClass.get(asset.assetClass) ?? 0) + calculateAssetValue(asset)
    );
  }

  return Array.from(byAssetClass.entries())
    .map(([assetClass, value]) => ({
      name: getAssetClassName(assetClass),
      value,
      percentage: (value / totalValue) * 100,
      color: getAssetClassColor(assetClass),
    }))
    .sort((a, b) => b.value - a.value);
}

function buildAssetChart(assets: AssetWithMetadata[], totalValue: number) {
  if (totalValue === 0) {
    return [];
  }

  return assets
    .map((asset, index) => {
      const value = calculateAssetValue(asset);
      return {
        name: asset.ticker,
        value,
        percentage: (value / totalValue) * 100,
        color: getChartColor(index),
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function sumAssetValues(assets: AssetWithMetadata[]): number {
  return assets.reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
}

function sumUnrealizedGains(assets: AssetWithMetadata[]): number {
  return assets.reduce((sum, asset) => sum + calculateUnrealizedGains(asset), 0);
}

function sumEstimatedTaxes(assets: AssetWithMetadata[]): number {
  return assets.reduce((sum, asset) => sum + calculateEstimatedTaxes(asset), 0);
}

function buildMonthRange(year: number, month: number) {
  return {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
}

function getNumberMetadata(asset: AssetWithMetadata, key: string): number {
  const value = asset.metadataRecord[key];
  return typeof value === "number" ? value : 0;
}

function getNumberSetting(settings: Record<string, unknown>, key: string): number {
  const value = settings[key];
  return typeof value === "number" ? value : 0;
}

function getStringSetting(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  return typeof value === "string" && value !== "__none__" ? value : undefined;
}

function getBooleanSetting(settings: Record<string, unknown>, key: string): boolean {
  return settings[key] === true;
}

function getAssetClassName(assetClass: string): string {
  const names: Record<string, string> = {
    equity: "Azioni",
    bonds: "Obbligazioni",
    crypto: "Criptovalute",
    realestate: "Immobili",
    cash: "Liquidita",
    commodity: "Materie Prime",
  };

  return names[assetClass] ?? assetClass;
}

function getAssetClassColor(assetClass: string): string {
  const colors: Record<string, string> = {
    equity: "#3b82f6",
    bonds: "#10b981",
    crypto: "#f59e0b",
    realestate: "#8b5cf6",
    cash: "#06b6d4",
    commodity: "#ef4444",
  };

  return colors[assetClass] ?? "#9CA3AF";
}

function getChartColor(index: number): string {
  const colors = [
    "#3b82f6",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ef4444",
    "#06b6d4",
    "#ec4899",
    "#84cc16",
    "#6366f1",
    "#14b8a6",
  ];

  return colors[index % colors.length];
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

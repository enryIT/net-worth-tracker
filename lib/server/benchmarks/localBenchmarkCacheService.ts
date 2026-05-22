import "server-only";

import { Prisma } from "@prisma/client";
import YahooFinance from "yahoo-finance2";
import { BENCHMARK_MAP } from "@/lib/constants/benchmarks";
import { prisma } from "@/lib/server/prisma";
import { formatDateInputValue } from "@/lib/utils/dateHelpers";
import type {
  BenchmarkMonthlyReturn,
  BenchmarkReturnsResponse,
  FxMonthlyRate,
  FxRatesResponse,
} from "@/types/benchmarks";

const FX_CACHE_KEY = "usd-eur";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FRANKFURTER_API_BASE = "https://api.frankfurter.app";

export async function getLocalFxRates(): Promise<FxRatesResponse> {
  const cached = await prisma.fxRateCache.findUnique({
    where: { key: FX_CACHE_KEY },
  });

  if (cached && isFresh(cached.cachedAt)) {
    return {
      monthlyRates: parseFxMonthlyRates(cached.monthlyRates),
      cachedAt: cached.cachedAt.toISOString(),
    };
  }

  const monthlyRates = await fetchMonthlyFxRates();
  const cachedAt = new Date();

  await prisma.fxRateCache.upsert({
    where: { key: FX_CACHE_KEY },
    create: {
      key: FX_CACHE_KEY,
      monthlyRates: monthlyRates as unknown as Prisma.InputJsonValue,
    },
    update: {
      monthlyRates: monthlyRates as unknown as Prisma.InputJsonValue,
      cachedAt,
    },
  });

  return {
    monthlyRates,
    cachedAt: cachedAt.toISOString(),
  };
}

export async function getLocalBenchmarkReturns(
  benchmarkId: string
): Promise<BenchmarkReturnsResponse> {
  const benchmark = BENCHMARK_MAP[benchmarkId];

  if (!benchmark) {
    throw new Error("BENCHMARK_NOT_FOUND");
  }

  const cached = await prisma.benchmarkReturnCache.findUnique({
    where: { benchmarkId },
  });

  if (cached && isFresh(cached.cachedAt)) {
    return {
      benchmarkId,
      name: benchmark.name,
      monthlyReturns: parseBenchmarkMonthlyReturns(cached.monthlyReturns),
      cachedAt: cached.cachedAt.toISOString(),
    };
  }

  const monthlyReturns = await computeBenchmarkReturns(benchmarkId);
  const cachedAt = new Date();

  await prisma.benchmarkReturnCache.upsert({
    where: { benchmarkId },
    create: {
      benchmarkId,
      monthlyReturns: monthlyReturns as unknown as Prisma.InputJsonValue,
    },
    update: {
      monthlyReturns: monthlyReturns as unknown as Prisma.InputJsonValue,
      cachedAt,
    },
  });

  return {
    benchmarkId,
    name: benchmark.name,
    monthlyReturns,
    cachedAt: cachedAt.toISOString(),
  };
}

async function fetchMonthlyFxRates(): Promise<FxMonthlyRate[]> {
  const today = formatDateInputValue();
  const url = `${FRANKFURTER_API_BASE}/2000-01-01..${today}?from=USD&to=EUR`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FRANKFURTER_API_ERROR:${response.status}`);
  }

  const data = (await response.json()) as {
    rates: Record<string, { EUR: number }>;
  };
  const monthMap = new Map<string, { date: string; eurPerUsd: number }>();

  for (const [date, rate] of Object.entries(data.rates)) {
    const monthKey = date.slice(0, 7);
    const existing = monthMap.get(monthKey);

    if (!existing || date > existing.date) {
      monthMap.set(monthKey, { date, eurPerUsd: rate.EUR });
    }
  }

  return Array.from(monthMap.entries())
    .map(([monthKey, { eurPerUsd }]) => {
      const [year, month] = monthKey.split("-").map(Number);
      return { year, month, eurPerUsd };
    })
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}

async function computeBenchmarkReturns(
  benchmarkId: string
): Promise<BenchmarkMonthlyReturn[]> {
  const benchmark = BENCHMARK_MAP[benchmarkId];
  const yahooFinance = new YahooFinance();
  const etfSeriesResults = await Promise.allSettled(
    benchmark.components.map(async (component) => {
      const result = await yahooFinance.chart(component.ticker, {
        period1: "2000-01-01",
        interval: "1mo",
      });
      const priceMap = new Map<string, number>();

      for (const quote of result.quotes) {
        const adjClose = (quote as { adjclose?: number | null }).adjclose ?? quote.close;
        if (adjClose == null || adjClose <= 0) {
          continue;
        }

        const date = new Date(quote.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        priceMap.set(key, adjClose);
      }

      return { ticker: component.ticker, weight: component.weight, priceMap };
    })
  );
  const etfSeries = etfSeriesResults
    .filter((result): result is PromiseFulfilledResult<{
      ticker: string;
      weight: number;
      priceMap: Map<string, number>;
    }> => result.status === "fulfilled")
    .map((result) => result.value);

  if (etfSeries.length === 0) {
    throw new Error("BENCHMARK_DATA_UNAVAILABLE");
  }

  const allMonths = new Set<string>();
  for (const series of etfSeries) {
    for (const key of series.priceMap.keys()) {
      allMonths.add(key);
    }
  }

  const sortedMonths = Array.from(allMonths).sort();
  const monthlyReturns: BenchmarkMonthlyReturn[] = [];

  for (let index = 1; index < sortedMonths.length; index++) {
    const previousKey = sortedMonths[index - 1];
    const currentKey = sortedMonths[index];

    if (!areConsecutiveMonths(previousKey, currentKey)) {
      continue;
    }

    let benchmarkReturn = 0;
    let totalWeight = 0;

    for (const series of etfSeries) {
      const previousPrice = series.priceMap.get(previousKey);
      const currentPrice = series.priceMap.get(currentKey);

      if (previousPrice == null || currentPrice == null || previousPrice === 0) {
        continue;
      }

      benchmarkReturn += series.weight * ((currentPrice - previousPrice) / previousPrice);
      totalWeight += series.weight;
    }

    if (totalWeight < 0.95) {
      continue;
    }

    const [year, month] = currentKey.split("-").map(Number);
    monthlyReturns.push({
      year,
      month,
      return: Number(benchmarkReturn.toFixed(12)),
    });
  }

  return monthlyReturns;
}

function isFresh(cachedAt: Date): boolean {
  return Date.now() - cachedAt.getTime() < CACHE_TTL_MS;
}

function areConsecutiveMonths(previousKey: string, currentKey: string): boolean {
  const [previousYear, previousMonth] = previousKey.split("-").map(Number);
  const [currentYear, currentMonth] = currentKey.split("-").map(Number);
  const expectedNext = new Date(previousYear, previousMonth, 1);
  const actual = new Date(currentYear, currentMonth - 1, 1);

  return (
    expectedNext.getFullYear() === actual.getFullYear() &&
    expectedNext.getMonth() === actual.getMonth()
  );
}

function parseFxMonthlyRates(input: Prisma.JsonValue): FxMonthlyRate[] {
  return Array.isArray(input) ? (input as unknown as FxMonthlyRate[]) : [];
}

function parseBenchmarkMonthlyReturns(input: Prisma.JsonValue): BenchmarkMonthlyReturn[] {
  return Array.isArray(input) ? (input as unknown as BenchmarkMonthlyReturn[]) : [];
}

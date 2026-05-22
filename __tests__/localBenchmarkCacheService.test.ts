import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock, yahooChartMock } = vi.hoisted(() => ({
  prismaMock: {
    benchmarkReturnCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    fxRateCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  yahooChartMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("yahoo-finance2", () => ({
  default: class YahooFinance {
    chart = yahooChartMock;
  },
}));

import {
  getLocalBenchmarkReturns,
  getLocalFxRates,
} from "@/lib/server/benchmarks/localBenchmarkCacheService";

const cachedAt = new Date();
const staleCachedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

describe("local benchmark cache service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rates: {
            "2026-01-15": { EUR: 0.91 },
            "2026-01-31": { EUR: 0.92 },
            "2026-02-28": { EUR: 0.93 },
          },
        }),
      })
    );
  });

  it("serves fresh FX rates from Postgres cache", async () => {
    prismaMock.fxRateCache.findUnique.mockResolvedValue({
      key: "usd-eur",
      monthlyRates: [{ year: 2026, month: 1, eurPerUsd: 0.92 }],
      cachedAt,
    });

    const result = await getLocalFxRates();

    expect(prismaMock.fxRateCache.findUnique).toHaveBeenCalledWith({
      where: { key: "usd-eur" },
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      monthlyRates: [{ year: 2026, month: 1, eurPerUsd: 0.92 }],
      cachedAt: cachedAt.toISOString(),
    });
  });

  it("refreshes stale FX rates from Frankfurter and stores them in Postgres", async () => {
    prismaMock.fxRateCache.findUnique.mockResolvedValue({
      key: "usd-eur",
      monthlyRates: [],
      cachedAt: staleCachedAt,
    });

    const result = await getLocalFxRates();

    expect(global.fetch).toHaveBeenCalledOnce();
    expect(prismaMock.fxRateCache.upsert).toHaveBeenCalledWith({
      where: { key: "usd-eur" },
      create: {
        key: "usd-eur",
        monthlyRates: [
          { year: 2026, month: 1, eurPerUsd: 0.92 },
          { year: 2026, month: 2, eurPerUsd: 0.93 },
        ],
      },
      update: {
        monthlyRates: [
          { year: 2026, month: 1, eurPerUsd: 0.92 },
          { year: 2026, month: 2, eurPerUsd: 0.93 },
        ],
        cachedAt: expect.any(Date),
      },
    });
    expect(result.monthlyRates).toEqual([
      { year: 2026, month: 1, eurPerUsd: 0.92 },
      { year: 2026, month: 2, eurPerUsd: 0.93 },
    ]);
  });

  it("serves fresh benchmark returns from Postgres cache", async () => {
    prismaMock.benchmarkReturnCache.findUnique.mockResolvedValue({
      benchmarkId: "60-40",
      monthlyReturns: [{ year: 2026, month: 2, return: 0.01 }],
      cachedAt,
    });

    const result = await getLocalBenchmarkReturns("60-40");

    expect(prismaMock.benchmarkReturnCache.findUnique).toHaveBeenCalledWith({
      where: { benchmarkId: "60-40" },
    });
    expect(yahooChartMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      benchmarkId: "60-40",
      name: "Portafoglio 60/40",
      monthlyReturns: [{ year: 2026, month: 2, return: 0.01 }],
      cachedAt: cachedAt.toISOString(),
    });
  });

  it("computes and caches benchmark returns when cache is stale", async () => {
    prismaMock.benchmarkReturnCache.findUnique.mockResolvedValue({
      benchmarkId: "60-40",
      monthlyReturns: [],
      cachedAt: staleCachedAt,
    });
    yahooChartMock
      .mockResolvedValueOnce({
        quotes: [
          { date: new Date("2026-01-31T00:00:00.000Z"), adjclose: 100 },
          { date: new Date("2026-02-28T00:00:00.000Z"), adjclose: 110 },
        ],
      })
      .mockResolvedValueOnce({
        quotes: [
          { date: new Date("2026-01-31T00:00:00.000Z"), adjclose: 200 },
          { date: new Date("2026-02-28T00:00:00.000Z"), adjclose: 210 },
        ],
      });

    const result = await getLocalBenchmarkReturns("60-40");

    expect(yahooChartMock).toHaveBeenCalledTimes(2);
    expect(prismaMock.benchmarkReturnCache.upsert).toHaveBeenCalledWith({
      where: { benchmarkId: "60-40" },
      create: {
        benchmarkId: "60-40",
        monthlyReturns: [{ year: 2026, month: 2, return: 0.08 }],
      },
      update: {
        monthlyReturns: [{ year: 2026, month: 2, return: 0.08 }],
        cachedAt: expect.any(Date),
      },
    });
    expect(result.monthlyReturns).toEqual([
      { year: 2026, month: 2, return: 0.08 },
    ]);
  });
});

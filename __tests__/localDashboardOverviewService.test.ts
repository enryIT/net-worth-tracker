import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    asset: {
      findMany: vi.fn(),
    },
    dashboardOverviewSummary: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    expense: {
      findMany: vi.fn(),
    },
    monthlySnapshot: {
      findMany: vi.fn(),
    },
    userSetting: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/utils/dateHelpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/dateHelpers")>(
    "@/lib/utils/dateHelpers"
  );

  return {
    ...actual,
    getItalyMonthYear: vi.fn(() => ({ month: 5, year: 2026 })),
  };
});

import { getLocalDashboardOverview } from "@/lib/server/dashboard/localDashboardOverviewService";
import { DASHBOARD_OVERVIEW_SOURCE_VERSION } from "@/lib/services/dashboardOverviewConstants";

const cachedPayload = {
  metrics: {
    totalValue: 1000,
    liquidNetWorth: 1000,
    illiquidNetWorth: 0,
    netTotal: 1000,
    liquidNetTotal: 1000,
    unrealizedGains: 0,
    estimatedTaxes: 0,
    portfolioTER: 0,
    annualPortfolioCost: 0,
    annualStampDuty: 0,
  },
  variations: {
    monthly: null,
    yearly: null,
  },
  expenseStats: null,
  charts: {
    assetClassData: [],
    assetData: [],
    liquidityData: [],
  },
  flags: {
    assetCount: 1,
    hasCostBasisTracking: false,
    hasTERTracking: false,
    hasStampDuty: false,
    currentMonthSnapshotExists: false,
  },
};

describe("local dashboard overview service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.dashboardOverviewSummary.upsert.mockResolvedValue({});
  });

  it("returns a fresh materialized overview summary from Postgres", async () => {
    prismaMock.dashboardOverviewSummary.findUnique.mockResolvedValue({
      userId: "user-1",
      payload: cachedPayload,
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      computedAt: new Date("2026-05-19T10:00:00.000Z"),
      invalidatedAt: null,
      updatedAt: new Date(),
    });

    const result = await getLocalDashboardOverview("user-1");

    expect(result.metrics.totalValue).toBe(1000);
    expect(result.freshness.source).toBe("materialized_summary");
    expect(prismaMock.asset.findMany).not.toHaveBeenCalled();
  });

  it("recomputes and persists the overview when the materialized summary is stale", async () => {
    prismaMock.dashboardOverviewSummary.findUnique.mockResolvedValue({
      userId: "user-1",
      payload: cachedPayload,
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      computedAt: new Date("2026-05-19T09:00:00.000Z"),
      invalidatedAt: new Date("2026-05-19T09:30:00.000Z"),
      updatedAt: new Date("2026-05-19T09:00:00.000Z"),
    });
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "cash-1",
        userId: "user-1",
        ticker: "EUR",
        name: "Conto corrente",
        type: "cash",
        assetClass: "cash",
        subCategory: "Checking",
        currency: "EUR",
        quantity: 1000,
        currentPrice: 1,
        currentPriceEur: null,
        metadata: { isLiquid: true },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-19T10:00:00.000Z"),
      },
      {
        id: "etf-1",
        userId: "user-1",
        ticker: "VWCE",
        name: "Vanguard",
        type: "etf",
        assetClass: "equity",
        subCategory: null,
        currency: "EUR",
        quantity: 10,
        currentPrice: 100,
        currentPriceEur: null,
        metadata: {
          averageCost: 80,
          taxRate: 26,
          totalExpenseRatio: 0.2,
          isLiquid: true,
        },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-19T10:00:00.000Z"),
      },
      {
        id: "home-1",
        userId: "user-1",
        ticker: "HOME",
        name: "Casa",
        type: "realestate",
        assetClass: "realestate",
        subCategory: null,
        currency: "EUR",
        quantity: 1,
        currentPrice: 200000,
        currentPriceEur: null,
        metadata: {
          outstandingDebt: 50000,
          isLiquid: false,
        },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-19T10:00:00.000Z"),
      },
    ]);
    prismaMock.monthlySnapshot.findMany.mockResolvedValue([
      {
        userId: "user-1",
        year: 2026,
        month: 4,
        isDummy: false,
        totalNetWorth: 150000,
        liquidNetWorth: 1800,
        illiquidNetWorth: 148200,
        fireNetWorth: null,
        byAssetClass: {},
        byAsset: [],
        byOwnershipProfile: {},
        byParticipant: {},
        assetAllocation: {},
        note: null,
        createdAt: new Date("2026-04-30T10:00:00.000Z"),
      },
    ]);
    prismaMock.userSetting.findUnique.mockResolvedValue({
      data: {
        stampDutyEnabled: true,
        stampDutyRate: 0.2,
        checkingAccountSubCategory: "Checking",
      },
    });
    prismaMock.expense.findMany
      .mockResolvedValueOnce([
        { type: "income", amount: 3000 },
        { type: "fixed", amount: -1000 },
      ])
      .mockResolvedValueOnce([
        { type: "income", amount: 2500 },
        { type: "fixed", amount: -800 },
      ]);

    const result = await getLocalDashboardOverview("user-1");

    expect(result.freshness.source).toBe("live_recompute");
    expect(result.metrics.totalValue).toBe(152000);
    expect(result.metrics.liquidNetWorth).toBe(2000);
    expect(result.metrics.illiquidNetWorth).toBe(150000);
    expect(result.metrics.unrealizedGains).toBe(200);
    expect(result.metrics.estimatedTaxes).toBe(52);
    expect(result.metrics.liquidNetTotal).toBe(1948);
    expect(result.metrics.portfolioTER).toBe(0.2);
    expect(result.metrics.annualPortfolioCost).toBe(2);
    expect(result.metrics.annualStampDuty).toBe(302);
    expect(result.variations.monthly).toEqual({
      value: 2000,
      percentage: 1.3333333333333335,
    });
    expect(result.expenseStats?.currentMonth).toEqual({
      income: 3000,
      expenses: 1000,
      net: 2000,
    });
    expect(result.flags).toMatchObject({
      assetCount: 3,
      hasCostBasisTracking: true,
      hasTERTracking: true,
      hasStampDuty: true,
      currentMonthSnapshotExists: false,
    });
    expect(prismaMock.dashboardOverviewSummary.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.objectContaining({
        userId: "user-1",
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        payload: expect.objectContaining({
          metrics: expect.objectContaining({ totalValue: 152000 }),
        }),
      }),
      update: expect.objectContaining({
        invalidatedAt: null,
        lastInvalidationReason: null,
      }),
    });
  });
});

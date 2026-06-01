import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardOverviewPayload } from "@/types/dashboardOverview";

vi.mock("server-only", () => ({}));
vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    fromDate: (value: Date) => value,
    now: () => new Date(),
  },
}));

const { getLocalDashboardOverviewMock, overviewSummaryDocGetMock } = vi.hoisted(() => ({
  getLocalDashboardOverviewMock: vi.fn(),
  overviewSummaryDocGetMock: vi.fn(),
}));

vi.mock("@/lib/server/dashboard/localDashboardOverviewService", () => ({
  getLocalDashboardOverview: getLocalDashboardOverviewMock,
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: overviewSummaryDocGetMock,
      })),
    })),
  },
}));

import { getDashboardOverview } from "@/lib/services/dashboardOverviewService";

const DASHBOARD_OVERVIEW_SERVICE_SOURCE = resolve(
  process.cwd(),
  "lib/services/dashboardOverviewService.ts"
);

function createDashboardOverviewPayload(): DashboardOverviewPayload {
  return {
    metrics: {
      totalValue: 1000,
      liquidNetWorth: 600,
      illiquidNetWorth: 400,
      netTotal: 980,
      liquidNetTotal: 590,
      unrealizedGains: 25,
      estimatedTaxes: 20,
      portfolioTER: 0.1,
      annualPortfolioCost: 1,
      annualStampDuty: 2,
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
      assetCount: 2,
      hasCostBasisTracking: false,
      hasTERTracking: true,
      hasStampDuty: true,
      currentMonthSnapshotExists: false,
    },
    freshness: {
      source: "live_recompute",
      updatedAt: "2026-06-01T08:00:00.000Z",
      computedAt: "2026-06-01T08:00:00.000Z",
      sourceVersion: 1,
      stale: false,
    },
  };
}

describe("dashboardOverviewService compatibility wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const payload = createDashboardOverviewPayload();
    const { freshness: _freshness, ...payloadWithoutFreshness } = payload;
    overviewSummaryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        payload: payloadWithoutFreshness,
        updatedAt: new Date("2026-06-01T08:00:00.000Z"),
        computedAt: new Date("2026-06-01T08:00:00.000Z"),
        sourceVersion: 1,
        invalidatedAt: null,
      }),
    });
  });

  it("has no Firebase Admin or Firestore runtime symbols", () => {
    const source = readFileSync(DASHBOARD_OVERVIEW_SERVICE_SOURCE, "utf8");

    expect(source).not.toMatch(/firebase-admin\/firestore/);
    expect(source).not.toMatch(/@\/lib\/firebase\/admin/);
    expect(source).not.toMatch(/\badminDb\b/);
    expect(source).not.toMatch(/\bTimestamp\b/);
    expect(source).not.toMatch(/FirebaseFirestore/);
  });

  it("delegates getDashboardOverview(userId) to getLocalDashboardOverview(userId)", async () => {
    const delegatedPayload = createDashboardOverviewPayload();
    getLocalDashboardOverviewMock.mockResolvedValue(delegatedPayload);

    const result = await getDashboardOverview("user-1");

    expect(getLocalDashboardOverviewMock).toHaveBeenCalledTimes(1);
    expect(getLocalDashboardOverviewMock).toHaveBeenCalledWith("user-1");
    expect(result).toBe(delegatedPayload);
  });
});

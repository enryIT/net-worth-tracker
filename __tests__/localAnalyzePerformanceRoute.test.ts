import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  analyzeLocalPerformanceMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  analyzeLocalPerformanceMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  AuthSessionError: class AuthSessionError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = "AuthSessionError";
    }
  },
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/ai/localAnalyzePerformanceService", () => ({
  analyzeLocalPerformance: analyzeLocalPerformanceMock,
}));

import { POST } from "@/app/api/ai/analyze-performance/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const validMetrics = {
  timePeriod: "YTD",
  startDate: "2026-01-01T00:00:00.000Z",
  endDate: "2026-05-31T00:00:00.000Z",
  dividendEndDate: "2026-05-31T00:00:00.000Z",
  startNetWorth: 100000,
  endNetWorth: 112000,
  cashFlows: [],
  roi: 12,
  cagr: 9,
  timeWeightedReturn: 10,
  moneyWeightedReturn: 8,
  sharpeRatio: 1.1,
  volatility: 12,
  maxDrawdown: -4,
  drawdownDuration: 2,
  recoveryTime: 1,
  riskFreeRate: 2,
  totalContributions: 5000,
  totalWithdrawals: 0,
  netCashFlow: 5000,
  totalIncome: 10000,
  totalExpenses: 5000,
  totalDividendIncome: 300,
  numberOfMonths: 5,
  yocGross: 2.5,
  yocNet: 1.8,
  yocDividendsGross: 300,
  yocDividendsNet: 220,
  yocCostBasis: 12000,
  yocAssetCount: 2,
  currentYield: 2.1,
  currentYieldNet: 1.5,
  currentYieldDividends: 300,
  currentYieldDividendsNet: 220,
  currentYieldPortfolioValue: 14000,
  currentYieldAssetCount: 2,
  hasInsufficientData: false,
};

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/analyze-performance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local analyze performance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    analyzeLocalPerformanceMock.mockResolvedValue(new ReadableStream());
  });

  it("streams analysis for the authenticated local user and ignores body userId", async () => {
    const response = await POST(
      createRequest({
        userId: "malicious-user",
        metrics: validMetrics,
        timePeriod: "YTD",
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(analyzeLocalPerformanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-05-31T00:00:00.000Z"),
        roi: 12,
      }),
      "YTD"
    );
  });

  it("rejects invalid payloads before calling Anthropic", async () => {
    const response = await POST(
      createRequest({
        metrics: { ...validMetrics, startDate: "not-a-date" },
        timePeriod: "YTD",
      })
    );

    expect(response.status).toBe(400);
    expect(analyzeLocalPerformanceMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(
      createRequest({ metrics: validMetrics, timePeriod: "YTD" })
    );

    expect(response.status).toBe(401);
    expect(analyzeLocalPerformanceMock).not.toHaveBeenCalled();
  });

  it("maps overloaded AI errors to a retryable 503", async () => {
    analyzeLocalPerformanceMock.mockRejectedValue({
      error: { type: "overloaded_error" },
    });

    const response = await POST(
      createRequest({ metrics: validMetrics, timePeriod: "YTD" })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.",
      retryable: true,
    });
  });
});

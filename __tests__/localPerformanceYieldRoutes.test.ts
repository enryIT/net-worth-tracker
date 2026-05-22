import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  getLocalCurrentYieldMetricsMock,
  getLocalYocMetricsMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  getLocalCurrentYieldMetricsMock: vi.fn(),
  getLocalYocMetricsMock: vi.fn(),
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

vi.mock("@/lib/server/performance/localYieldMetricsService", () => ({
  getLocalCurrentYieldMetrics: getLocalCurrentYieldMetricsMock,
  getLocalYocMetrics: getLocalYocMetricsMock,
}));

import { GET as getCurrentYield } from "@/app/api/performance/current-yield/route";
import { GET as getYoc } from "@/app/api/performance/yoc/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const validQuery =
  "startDate=2026-01-01T00:00:00.000Z&dividendEndDate=2026-12-31T23:59:59.999Z&numberOfMonths=12";

describe("local performance yield routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalCurrentYieldMetricsMock.mockResolvedValue({ currentYield: 3.1 });
    getLocalYocMetricsMock.mockResolvedValue({ yocGross: 4.2 });
  });

  it("returns local YOC metrics for the authenticated user and ignores legacy userId", async () => {
    const response = await getYoc(
      new NextRequest(`http://localhost/api/performance/yoc?userId=firebase-user&${validQuery}`)
    );

    expect(response.status).toBe(200);
    expect(getLocalYocMetricsMock).toHaveBeenCalledWith("user-1", {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      dividendEndDate: new Date("2026-12-31T23:59:59.999Z"),
      numberOfMonths: 12,
    });
    await expect(response.json()).resolves.toEqual({ yocGross: 4.2 });
  });

  it("returns local current yield metrics for the authenticated user", async () => {
    const response = await getCurrentYield(
      new NextRequest(`http://localhost/api/performance/current-yield?${validQuery}`)
    );

    expect(response.status).toBe(200);
    expect(getLocalCurrentYieldMetricsMock).toHaveBeenCalledWith("user-1", {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      dividendEndDate: new Date("2026-12-31T23:59:59.999Z"),
      numberOfMonths: 12,
    });
    await expect(response.json()).resolves.toEqual({ currentYield: 3.1 });
  });

  it("rejects invalid period parameters before calling services", async () => {
    const response = await getYoc(
      new NextRequest("http://localhost/api/performance/yoc?numberOfMonths=0")
    );

    expect(response.status).toBe(400);
    expect(getLocalYocMetricsMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await getCurrentYield(
      new NextRequest(`http://localhost/api/performance/current-yield?${validQuery}`)
    );

    expect(response.status).toBe(401);
  });
});

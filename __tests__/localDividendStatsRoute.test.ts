import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  getLocalDividendStatsMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  getLocalDividendStatsMock: vi.fn(),
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

vi.mock("@/lib/server/dividends/localDividendStatsService", () => ({
  getLocalDividendStats: getLocalDividendStatsMock,
}));

import { GET } from "@/app/api/dividends/stats/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("local dividend stats route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalDividendStatsMock.mockResolvedValue({
      success: true,
      stats: { period: { totalNet: 37 } },
      period: "all_time",
    });
  });

  it("returns stats for the authenticated local user and ignores legacy userId", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/dividends/stats?userId=firebase-user&assetId=asset-1&startDate=2026-01-01T00:00:00.000Z"
      )
    );

    expect(response.status).toBe(200);
    expect(getLocalDividendStatsMock).toHaveBeenCalledWith("user-1", {
      assetId: "asset-1",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: undefined,
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      stats: { period: { totalNet: 37 } },
      period: "all_time",
    });
  });

  it("rejects invalid date filters before calling the service", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/dividends/stats?startDate=nope")
    );

    expect(response.status).toBe(400);
    expect(getLocalDividendStatsMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET(
      new NextRequest("http://localhost/api/dividends/stats")
    );

    expect(response.status).toBe(401);
  });
});

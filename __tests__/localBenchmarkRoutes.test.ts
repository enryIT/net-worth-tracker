import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  getLocalBenchmarkReturnsMock,
  getLocalFxRatesMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  getLocalBenchmarkReturnsMock: vi.fn(),
  getLocalFxRatesMock: vi.fn(),
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

vi.mock("@/lib/server/benchmarks/localBenchmarkCacheService", () => ({
  getLocalBenchmarkReturns: getLocalBenchmarkReturnsMock,
  getLocalFxRates: getLocalFxRatesMock,
}));

import { GET as getFxRates } from "@/app/api/benchmarks/fx-rates/route";
import { GET as getBenchmarkReturns } from "@/app/api/benchmarks/returns/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("local benchmark routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalFxRatesMock.mockResolvedValue({
      monthlyRates: [{ year: 2026, month: 1, eurPerUsd: 0.92 }],
      cachedAt: "2026-05-19T10:00:00.000Z",
    });
    getLocalBenchmarkReturnsMock.mockResolvedValue({
      benchmarkId: "60-40",
      name: "Portafoglio 60/40",
      monthlyReturns: [{ year: 2026, month: 2, return: 0.01 }],
      cachedAt: "2026-05-19T10:00:00.000Z",
    });
  });

  it("returns FX rates for authenticated local users", async () => {
    const response = await getFxRates(
      new NextRequest("http://localhost/api/benchmarks/fx-rates")
    );

    expect(response.status).toBe(200);
    expect(requireUserSessionMock).toHaveBeenCalledOnce();
    expect(getLocalFxRatesMock).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      monthlyRates: [{ year: 2026, month: 1, eurPerUsd: 0.92 }],
      cachedAt: "2026-05-19T10:00:00.000Z",
    });
  });

  it("returns benchmark returns for authenticated local users", async () => {
    const response = await getBenchmarkReturns(
      new NextRequest("http://localhost/api/benchmarks/returns?benchmarkId=60-40")
    );

    expect(response.status).toBe(200);
    expect(getLocalBenchmarkReturnsMock).toHaveBeenCalledWith("60-40");
    await expect(response.json()).resolves.toEqual({
      benchmarkId: "60-40",
      name: "Portafoglio 60/40",
      monthlyReturns: [{ year: 2026, month: 2, return: 0.01 }],
      cachedAt: "2026-05-19T10:00:00.000Z",
    });
  });

  it("rejects invalid benchmark queries before calling the service", async () => {
    const response = await getBenchmarkReturns(
      new NextRequest("http://localhost/api/benchmarks/returns")
    );

    expect(response.status).toBe(400);
    expect(getLocalBenchmarkReturnsMock).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown benchmarks", async () => {
    getLocalBenchmarkReturnsMock.mockRejectedValue(new Error("BENCHMARK_NOT_FOUND"));

    const response = await getBenchmarkReturns(
      new NextRequest("http://localhost/api/benchmarks/returns?benchmarkId=missing")
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await getFxRates(
      new NextRequest("http://localhost/api/benchmarks/fx-rates")
    );

    expect(response.status).toBe(401);
  });
});

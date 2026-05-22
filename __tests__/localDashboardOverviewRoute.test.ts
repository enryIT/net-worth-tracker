import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const { getLocalDashboardOverviewMock, requireUserSessionMock } = vi.hoisted(() => ({
  getLocalDashboardOverviewMock: vi.fn(),
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

vi.mock("@/lib/server/dashboard/localDashboardOverviewService", () => ({
  getLocalDashboardOverview: getLocalDashboardOverviewMock,
}));

import { GET } from "@/app/api/dashboard/overview/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("local dashboard overview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalDashboardOverviewMock.mockResolvedValue({
      metrics: { totalValue: 1000 },
      freshness: { source: "materialized_summary" },
    });
  });

  it("returns overview for the authenticated local user", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/dashboard/overview")
    );

    expect(response.status).toBe(200);
    expect(requireUserSessionMock).toHaveBeenCalledOnce();
    expect(getLocalDashboardOverviewMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      metrics: { totalValue: 1000 },
      freshness: { source: "materialized_summary" },
    });
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET(
      new NextRequest("http://localhost/api/dashboard/overview")
    );

    expect(response.status).toBe(401);
    expect(getLocalDashboardOverviewMock).not.toHaveBeenCalled();
  });
});

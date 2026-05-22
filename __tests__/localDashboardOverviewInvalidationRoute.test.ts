import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  invalidateLocalDashboardOverviewSummaryMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  invalidateLocalDashboardOverviewSummaryMock: vi.fn(),
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

vi.mock("@/lib/server/dashboard/localDashboardOverviewInvalidationService", () => ({
  invalidateLocalDashboardOverviewSummary: invalidateLocalDashboardOverviewSummaryMock,
}));

import { POST } from "@/app/api/dashboard/overview/invalidate/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/dashboard/overview/invalidate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local dashboard overview invalidation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("invalidates the authenticated user's overview summary with a trimmed reason", async () => {
    const response = await POST(createJsonRequest({ reason: " expense_created " }));

    expect(response.status).toBe(200);
    expect(requireUserSessionMock).toHaveBeenCalledOnce();
    expect(invalidateLocalDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "user-1",
      "expense_created"
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("uses the default reason when the body has no valid reason", async () => {
    const response = await POST(createJsonRequest({ reason: "" }));

    expect(response.status).toBe(200);
    expect(invalidateLocalDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "user-1",
      "client_mutation"
    );
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(createJsonRequest({ reason: "expense_created" }));

    expect(response.status).toBe(401);
    expect(invalidateLocalDashboardOverviewSummaryMock).not.toHaveBeenCalled();
  });
});

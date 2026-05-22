import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalAutomatedSnapshotMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalAutomatedSnapshotMock: vi.fn(),
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
  assertWritableUser: assertWritableUserMock,
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/snapshots/localAutomatedSnapshotService", () => ({
  createLocalAutomatedSnapshot: createLocalAutomatedSnapshotMock,
}));

import { POST } from "@/app/api/portfolio/snapshot/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/portfolio/snapshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local automated snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    createLocalAutomatedSnapshotMock.mockResolvedValue({
      success: true,
      message: "Snapshot creato con successo",
      snapshotId: "user-1-2026-5",
      data: {
        year: 2026,
        month: 5,
        totalNetWorth: 1000,
        liquidNetWorth: 1000,
        assetsCount: 1,
      },
    });
  });

  it("creates snapshots for the authenticated local user and ignores body userId", async () => {
    const response = await POST(
      createRequest({ userId: "malicious-user", year: 2026, month: 5 })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalAutomatedSnapshotMock).toHaveBeenCalledWith("user-1", {
      year: 2026,
      month: 5,
    });
  });

  it("allows cron callers with a valid shared secret and explicit userId", async () => {
    const response = await POST(
      createRequest({ userId: "user-2", cronSecret: "test-cron-secret" })
    );

    expect(response.status).toBe(200);
    expect(requireUserSessionMock).not.toHaveBeenCalled();
    expect(assertWritableUserMock).not.toHaveBeenCalled();
    expect(createLocalAutomatedSnapshotMock).toHaveBeenCalledWith("user-2", {});
  });

  it("rejects invalid cron secrets", async () => {
    const response = await POST(
      createRequest({ userId: "user-2", cronSecret: "wrong-secret" })
    );

    expect(response.status).toBe(401);
    expect(createLocalAutomatedSnapshotMock).not.toHaveBeenCalled();
  });

  it("rejects invalid snapshot periods", async () => {
    const response = await POST(createRequest({ year: 2026, month: 13 }));

    expect(response.status).toBe(400);
    expect(createLocalAutomatedSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(createRequest({}));

    expect(response.status).toBe(401);
    expect(createLocalAutomatedSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns 403 for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError("Non disponibile in modalita demo.", "DEMO_READONLY");
    });

    const response = await POST(createRequest({}));

    expect(response.status).toBe(403);
    expect(createLocalAutomatedSnapshotMock).not.toHaveBeenCalled();
  });
});

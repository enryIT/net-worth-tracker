import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  listLocalSnapshotsMock,
  requireUserSessionMock,
  upsertLocalSnapshotMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  listLocalSnapshotsMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  upsertLocalSnapshotMock: vi.fn(),
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

vi.mock("@/lib/server/snapshots/localSnapshotService", () => ({
  listLocalSnapshots: listLocalSnapshotsMock,
  upsertLocalSnapshot: upsertLocalSnapshotMock,
}));

import { GET, POST } from "@/app/api/snapshots/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local snapshots route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("lists snapshots for the authenticated user", async () => {
    listLocalSnapshotsMock.mockResolvedValue([{ year: 2026, month: 5 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listLocalSnapshotsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual([{ year: 2026, month: 5 }]);
  });

  it("returns 401 when listing without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("upserts snapshots for writable users", async () => {
    upsertLocalSnapshotMock.mockResolvedValue({ year: 2026, month: 5 });

    const response = await POST(
      createJsonRequest({
        year: 2026,
        month: 5,
        totalNetWorth: 110000,
        liquidNetWorth: 90000,
        illiquidNetWorth: 20000,
        byAssetClass: { equity: 90000, realestate: 20000 },
        byAsset: [],
        assetAllocation: { equity: 81.82, realestate: 18.18 },
      })
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(upsertLocalSnapshotMock).toHaveBeenCalledWith("user-1", {
      year: 2026,
      month: 5,
      totalNetWorth: 110000,
      liquidNetWorth: 90000,
      illiquidNetWorth: 20000,
      byAssetClass: { equity: 90000, realestate: 20000 },
      byAsset: [],
      assetAllocation: { equity: 81.82, realestate: 18.18 },
    });
  });

  it("rejects invalid snapshot payloads", async () => {
    const response = await POST(
      createJsonRequest({
        year: 2026,
        month: 13,
        totalNetWorth: 110000,
        liquidNetWorth: 90000,
        illiquidNetWorth: 20000,
        byAssetClass: { equity: 90000 },
        byAsset: [],
        assetAllocation: { equity: 100 },
      })
    );

    expect(response.status).toBe(400);
    expect(upsertLocalSnapshotMock).not.toHaveBeenCalled();
  });
});

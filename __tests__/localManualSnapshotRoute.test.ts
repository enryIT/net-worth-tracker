import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalManualSnapshotMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalManualSnapshotMock: vi.fn(),
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

vi.mock("@/lib/server/snapshots/localManualSnapshotService", () => ({
  createLocalManualSnapshot: createLocalManualSnapshotMock,
}));

import { POST } from "@/app/api/portfolio/snapshot/manual/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/portfolio/snapshot/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  userId: "malicious-user",
  year: 2026,
  month: 5,
  totalNetWorth: 110000,
  liquidNetWorth: 90000,
  illiquidNetWorth: 20000,
  byAssetClass: { equity: 90000, realestate: 20000 },
  byAsset: [],
  byOwnershipProfile: {
    family: {
      profileName: "Famiglia",
      totalValue: 110000,
    },
  },
  byParticipant: {
    enrico: {
      participantName: "Enrico",
      totalValue: 110000,
    },
  },
  assetAllocation: { equity: 81.82, realestate: 18.18 },
};

describe("local manual snapshot route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    createLocalManualSnapshotMock.mockResolvedValue({
      success: true,
      snapshotId: "user-1-2026-5",
      message: "Snapshot manuale creato correttamente.",
    });
  });

  it("creates manual snapshots for the authenticated local user", async () => {
    const response = await POST(createRequest(validPayload));

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalManualSnapshotMock).toHaveBeenCalledWith("user-1", {
      year: 2026,
      month: 5,
      totalNetWorth: 110000,
      liquidNetWorth: 90000,
      illiquidNetWorth: 20000,
      byAssetClass: { equity: 90000, realestate: 20000 },
      byAsset: [],
      byOwnershipProfile: {
        family: {
          profileName: "Famiglia",
          totalValue: 110000,
        },
      },
      byParticipant: {
        enrico: {
          participantName: "Enrico",
          totalValue: 110000,
        },
      },
      assetAllocation: { equity: 81.82, realestate: 18.18 },
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      snapshotId: "user-1-2026-5",
      message: "Snapshot manuale creato correttamente.",
    });
  });

  it("rejects invalid manual snapshot payloads", async () => {
    const response = await POST(
      createRequest({
        ...validPayload,
        month: 13,
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalManualSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(createRequest(validPayload));

    expect(response.status).toBe(401);
    expect(createLocalManualSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns 403 for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError("Non disponibile in modalita demo.", "DEMO_READONLY");
    });

    const response = await POST(createRequest(validPayload));

    expect(response.status).toBe(403);
    expect(createLocalManualSnapshotMock).not.toHaveBeenCalled();
  });
});

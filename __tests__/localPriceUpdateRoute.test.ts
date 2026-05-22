import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  requireUserSessionMock,
  updateLocalUserAssetPricesMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalUserAssetPricesMock: vi.fn(),
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

vi.mock("@/lib/server/prices/localPriceUpdateService", () => ({
  updateLocalUserAssetPrices: updateLocalUserAssetPricesMock,
}));

import { POST } from "@/app/api/prices/update/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("local price update route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    updateLocalUserAssetPricesMock.mockResolvedValue({
      updated: 2,
      failed: ["AAPL"],
      message: "Updated 2 assets, 1 failed",
    });
  });

  it("updates prices for the authenticated local user", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/prices/update", {
        method: "POST",
        body: JSON.stringify({ userId: "malicious-user" }),
      })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(updateLocalUserAssetPricesMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      updated: 2,
      failed: ["AAPL"],
      message: "Updated 2 assets, 1 failed",
    });
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(
      new NextRequest("http://localhost/api/prices/update", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    expect(updateLocalUserAssetPricesMock).not.toHaveBeenCalled();
  });

  it("returns 403 for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError("Non disponibile in modalita demo.", "DEMO_READONLY");
    });

    const response = await POST(
      new NextRequest("http://localhost/api/prices/update", {
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    expect(updateLocalUserAssetPricesMock).not.toHaveBeenCalled();
  });
});

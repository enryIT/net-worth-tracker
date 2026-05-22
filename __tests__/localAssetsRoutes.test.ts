import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalAssetMock,
  listLocalAssetsMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalAssetMock: vi.fn(),
  listLocalAssetsMock: vi.fn(),
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

vi.mock("@/lib/server/assets/localAssetService", () => ({
  createLocalAsset: createLocalAssetMock,
  listLocalAssets: listLocalAssetsMock,
}));

import { GET, POST } from "@/app/api/assets/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local assets route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("lists assets for the authenticated user", async () => {
    listLocalAssetsMock.mockResolvedValue([{ id: "asset-1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listLocalAssetsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual([{ id: "asset-1" }]);
  });

  it("returns 401 when listing without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("creates assets for writable users", async () => {
    createLocalAssetMock.mockResolvedValue({ id: "asset-1" });

    const response = await POST(
      createJsonRequest({
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        type: "etf",
        assetClass: "equity",
        currency: "EUR",
        quantity: 10,
        currentPrice: 100,
      })
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalAssetMock).toHaveBeenCalledWith("user-1", {
      ticker: "VWCE",
      name: "Vanguard FTSE All-World",
      type: "etf",
      assetClass: "equity",
      currency: "EUR",
      quantity: 10,
      currentPrice: 100,
    });
  });

  it("rejects invalid asset payloads", async () => {
    const response = await POST(
      createJsonRequest({
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        type: "etf",
        assetClass: "equity",
        currency: "EUR",
        quantity: -1,
        currentPrice: 100,
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalAssetMock).not.toHaveBeenCalled();
  });
});

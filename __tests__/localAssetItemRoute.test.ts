import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  deleteLocalAssetMock,
  getLocalAssetByIdMock,
  requireUserSessionMock,
  updateLocalAssetMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  deleteLocalAssetMock: vi.fn(),
  getLocalAssetByIdMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalAssetMock: vi.fn(),
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
  deleteLocalAsset: deleteLocalAssetMock,
  getLocalAssetById: getLocalAssetByIdMock,
  updateLocalAsset: updateLocalAssetMock,
}));

import { DELETE, GET, PUT } from "@/app/api/assets/[assetId]/route";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const params = Promise.resolve({ assetId: "asset-1" });

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/assets/asset-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local asset item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("updates assets for writable users", async () => {
    updateLocalAssetMock.mockResolvedValue({ id: "asset-1", quantity: 7 });

    const response = await PUT(
      createJsonRequest({
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        type: "etf",
        assetClass: "equity",
        currency: "EUR",
        quantity: 7,
        currentPrice: 101,
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(updateLocalAssetMock).toHaveBeenCalledWith("user-1", "asset-1", {
      ticker: "VWCE",
      name: "Vanguard FTSE All-World",
      type: "etf",
      assetClass: "equity",
      currency: "EUR",
      quantity: 7,
      currentPrice: 101,
    });
  });

  it("gets one asset for the authenticated user", async () => {
    getLocalAssetByIdMock.mockResolvedValue({ id: "asset-1", name: "VWCE" });

    const response = await GET(
      new NextRequest("http://localhost/api/assets/asset-1", { method: "GET" }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(getLocalAssetByIdMock).toHaveBeenCalledWith("user-1", "asset-1");
  });

  it("returns 404 when the requested asset does not exist", async () => {
    getLocalAssetByIdMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/assets/asset-1", { method: "GET" }),
      { params }
    );

    expect(response.status).toBe(404);
  });

  it("rejects invalid updates", async () => {
    const response = await PUT(
      createJsonRequest({
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        type: "etf",
        assetClass: "equity",
        currency: "EUR",
        quantity: -1,
        currentPrice: 101,
      }),
      { params }
    );

    expect(response.status).toBe(400);
    expect(updateLocalAssetMock).not.toHaveBeenCalled();
  });

  it("accepts negative quantity updates for cash assets", async () => {
    updateLocalAssetMock.mockResolvedValue({ id: "asset-1", quantity: -1, assetClass: "cash" });

    const response = await PUT(
      createJsonRequest({
        ticker: "CONTO",
        name: "Conto Corrente",
        type: "cash",
        assetClass: "cash",
        currency: "EUR",
        quantity: -1,
        currentPrice: 1,
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(updateLocalAssetMock).toHaveBeenCalledWith("user-1", "asset-1", {
      ticker: "CONTO",
      name: "Conto Corrente",
      type: "cash",
      assetClass: "cash",
      currency: "EUR",
      quantity: -1,
      currentPrice: 1,
    });
  });

  it("deletes assets for writable users", async () => {
    deleteLocalAssetMock.mockResolvedValue(true);

    const response = await DELETE(
      new NextRequest("http://localhost/api/assets/asset-1", { method: "DELETE" }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(deleteLocalAssetMock).toHaveBeenCalledWith("user-1", "asset-1");
  });

  it("returns 404 when deleting a non-owned asset", async () => {
    deleteLocalAssetMock.mockResolvedValue(false);

    const response = await DELETE(
      new NextRequest("http://localhost/api/assets/asset-1", { method: "DELETE" }),
      { params }
    );

    expect(response.status).toBe(404);
  });
});

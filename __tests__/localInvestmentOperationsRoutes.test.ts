import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalInvestmentOperationMock,
  deleteLocalInvestmentOperationMock,
  getLocalRealizedInvestmentSummaryMock,
  listLocalInvestmentOperationsMock,
  requireUserSessionMock,
  updateLocalInvestmentOperationMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalInvestmentOperationMock: vi.fn(),
  deleteLocalInvestmentOperationMock: vi.fn(),
  getLocalRealizedInvestmentSummaryMock: vi.fn(),
  listLocalInvestmentOperationsMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalInvestmentOperationMock: vi.fn(),
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

vi.mock("@/lib/server/cashflow/localInvestmentOperationService", () => ({
  createLocalInvestmentOperation: createLocalInvestmentOperationMock,
  deleteLocalInvestmentOperation: deleteLocalInvestmentOperationMock,
  getLocalRealizedInvestmentSummary: getLocalRealizedInvestmentSummaryMock,
  listLocalInvestmentOperations: listLocalInvestmentOperationsMock,
  updateLocalInvestmentOperation: updateLocalInvestmentOperationMock,
}));

import {
  GET,
  POST,
} from "@/app/api/investment-operations/route";
import { GET as GET_SUMMARY } from "@/app/api/investment-operations/realized-summary/route";
import {
  DELETE,
  PUT,
} from "@/app/api/investment-operations/[operationId]/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/investment-operations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeContext = {
  params: Promise.resolve({ operationId: "operation-1" }),
};

describe("local investment operations routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns operations for the authenticated user", async () => {
    listLocalInvestmentOperationsMock.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listLocalInvestmentOperationsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns realized summary for the authenticated user", async () => {
    getLocalRealizedInvestmentSummaryMock.mockResolvedValue({
      totalRealizedGain: 0,
      totalRealizedTaxes: 0,
      totalNetRealizedGain: 0,
      sellsCount: 0,
      byAsset: [],
    });

    const response = await GET_SUMMARY();

    expect(response.status).toBe(200);
    expect(getLocalRealizedInvestmentSummaryMock).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("creates operations for writable users", async () => {
    createLocalInvestmentOperationMock.mockResolvedValue({ id: "operation-1" });

    const response = await POST(
      createJsonRequest({
        assetId: "asset-1",
        type: "buy",
        quantity: 2,
        pricePerUnit: 100,
        fees: 1,
        taxes: 0,
        date: "2026-05-17T00:00:00.000Z",
        cashAssetId: "cash-1",
      })
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalInvestmentOperationMock).toHaveBeenCalledWith("user-1", {
      assetId: "asset-1",
      type: "buy",
      quantity: 2,
      pricePerUnit: 100,
      fees: 1,
      taxes: 0,
      currency: undefined,
      cashAssetId: "cash-1",
      cashAssetName: undefined,
      linkedExpenseId: undefined,
      notes: undefined,
      date: new Date("2026-05-17T00:00:00.000Z"),
    });
  });

  it("rejects invalid operation payloads", async () => {
    const response = await POST(
      createJsonRequest({
        assetId: "asset-1",
        type: "buy",
        quantity: 0,
        pricePerUnit: 100,
        date: "2026-05-17T00:00:00.000Z",
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalInvestmentOperationMock).not.toHaveBeenCalled();
  });

  it("updates operations for writable users", async () => {
    updateLocalInvestmentOperationMock.mockResolvedValue({ id: "operation-1" });

    const response = await PUT(
      createJsonRequest({
        assetId: "asset-1",
        type: "buy",
        quantity: 1,
        pricePerUnit: 110,
        date: "2026-05-18T00:00:00.000Z",
      }),
      routeContext
    );

    expect(response.status).toBe(200);
    expect(updateLocalInvestmentOperationMock).toHaveBeenCalledWith(
      "user-1",
      "operation-1",
      expect.objectContaining({
        quantity: 1,
        pricePerUnit: 110,
      })
    );
  });

  it("returns 404 when an update target does not exist", async () => {
    updateLocalInvestmentOperationMock.mockResolvedValue(null);

    const response = await PUT(
      createJsonRequest({
        assetId: "asset-1",
        type: "buy",
        quantity: 1,
        pricePerUnit: 110,
        date: "2026-05-18T00:00:00.000Z",
      }),
      routeContext
    );

    expect(response.status).toBe(404);
  });

  it("deletes operations for writable users", async () => {
    deleteLocalInvestmentOperationMock.mockResolvedValue(true);

    const response = await DELETE(new NextRequest("http://localhost"), routeContext);

    expect(response.status).toBe(200);
    expect(deleteLocalInvestmentOperationMock).toHaveBeenCalledWith(
      "user-1",
      "operation-1"
    );
  });
});

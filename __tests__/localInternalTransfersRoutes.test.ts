import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalInternalTransferMock,
  deleteLocalInternalTransferMock,
  listLocalInternalTransfersMock,
  requireUserSessionMock,
  updateLocalInternalTransferMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalInternalTransferMock: vi.fn(),
  deleteLocalInternalTransferMock: vi.fn(),
  listLocalInternalTransfersMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalInternalTransferMock: vi.fn(),
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

vi.mock("@/lib/server/cashflow/localInternalTransferService", () => ({
  createLocalInternalTransfer: createLocalInternalTransferMock,
  deleteLocalInternalTransfer: deleteLocalInternalTransferMock,
  listLocalInternalTransfers: listLocalInternalTransfersMock,
  updateLocalInternalTransfer: updateLocalInternalTransferMock,
}));

import {
  GET,
  POST,
} from "@/app/api/internal-transfers/route";
import {
  DELETE,
  PUT,
} from "@/app/api/internal-transfers/[transferId]/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown, method = "POST"): NextRequest {
  return new NextRequest("http://localhost/api/internal-transfers", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeContext = {
  params: Promise.resolve({ transferId: "transfer-1" }),
};

describe("local internal transfers routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns transfers for the authenticated user", async () => {
    listLocalInternalTransfersMock.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listLocalInternalTransfersMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns 401 without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("creates transfers for writable users", async () => {
    createLocalInternalTransferMock.mockResolvedValue({ id: "transfer-1" });

    const response = await POST(
      createJsonRequest({
        fromCashAssetId: "cash-1",
        toCashAssetId: "cash-2",
        amount: 250,
        fees: 2,
        date: "2026-05-17T00:00:00.000Z",
      })
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalInternalTransferMock).toHaveBeenCalledWith("user-1", {
      fromCashAssetId: "cash-1",
      toCashAssetId: "cash-2",
      amount: 250,
      currency: undefined,
      date: new Date("2026-05-17T00:00:00.000Z"),
      fees: 2,
      purpose: undefined,
      notes: undefined,
      linkedExpenseId: undefined,
    });
  });

  it("rejects invalid transfer payloads", async () => {
    const response = await POST(
      createJsonRequest({
        fromCashAssetId: "cash-1",
        toCashAssetId: "cash-2",
        amount: 0,
        date: "2026-05-17T00:00:00.000Z",
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalInternalTransferMock).not.toHaveBeenCalled();
  });

  it("updates transfers for writable users", async () => {
    updateLocalInternalTransferMock.mockResolvedValue({ id: "transfer-1" });

    const response = await PUT(
      createJsonRequest(
        {
          fromCashAssetId: "cash-1",
          toCashAssetId: "cash-2",
          amount: 100,
          date: "2026-05-18T00:00:00.000Z",
        },
        "PUT"
      ),
      routeContext
    );

    expect(response.status).toBe(200);
    expect(updateLocalInternalTransferMock).toHaveBeenCalledWith(
      "user-1",
      "transfer-1",
      expect.objectContaining({
        amount: 100,
      })
    );
  });

  it("returns 404 when an update target does not exist", async () => {
    updateLocalInternalTransferMock.mockResolvedValue(null);

    const response = await PUT(
      createJsonRequest(
        {
          fromCashAssetId: "cash-1",
          toCashAssetId: "cash-2",
          amount: 100,
          date: "2026-05-18T00:00:00.000Z",
        },
        "PUT"
      ),
      routeContext
    );

    expect(response.status).toBe(404);
  });

  it("deletes transfers for writable users", async () => {
    deleteLocalInternalTransferMock.mockResolvedValue(true);

    const response = await DELETE(new NextRequest("http://localhost"), routeContext);

    expect(response.status).toBe(200);
    expect(deleteLocalInternalTransferMock).toHaveBeenCalledWith(
      "user-1",
      "transfer-1"
    );
  });
});

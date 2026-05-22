import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  requireUserSessionMock,
  syncLocalDividendExpensesMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  syncLocalDividendExpensesMock: vi.fn(),
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

vi.mock("@/lib/server/dividends/localDividendExpenseSyncService", () => ({
  syncLocalDividendExpenses: syncLocalDividendExpensesMock,
}));

import { POST } from "@/app/api/dividends/sync-expenses/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/dividends/sync-expenses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local dividend expense sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    syncLocalDividendExpensesMock.mockResolvedValue({
      created: 1,
      skipped: 0,
      failed: 0,
    });
  });

  it("syncs dividend expenses for the authenticated user and ignores legacy userId", async () => {
    const response = await POST(
      createJsonRequest({
        userId: "legacy-firebase-user",
        dividends: [{ id: "dividend-1" }],
        categoryId: "category-1",
        categoryName: "Dividendi",
        subCategoryId: "subcategory-1",
        subCategoryName: "Azioni",
      })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(syncLocalDividendExpensesMock).toHaveBeenCalledWith("user-1", {
      dividendIds: ["dividend-1"],
      categoryId: "category-1",
      categoryName: "Dividendi",
      subCategoryId: "subcategory-1",
      subCategoryName: "Azioni",
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      result: { created: 1, skipped: 0, failed: 0 },
    });
  });

  it("rejects invalid payloads before calling the service", async () => {
    const response = await POST(createJsonRequest({ categoryId: "" }));

    expect(response.status).toBe(400);
    expect(syncLocalDividendExpensesMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(createJsonRequest({
      categoryId: "category-1",
      categoryName: "Dividendi",
    }));

    expect(response.status).toBe(401);
  });
});

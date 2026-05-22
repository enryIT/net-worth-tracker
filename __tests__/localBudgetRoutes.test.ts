import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  getLocalBudgetConfigMock,
  requireUserSessionMock,
  saveLocalBudgetConfigMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  getLocalBudgetConfigMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  saveLocalBudgetConfigMock: vi.fn(),
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

vi.mock("@/lib/server/cashflow/localBudgetService", () => ({
  getLocalBudgetConfig: getLocalBudgetConfigMock,
  saveLocalBudgetConfig: saveLocalBudgetConfigMock,
}));

import { GET, PUT } from "@/app/api/budget/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/budget", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local budget route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns the authenticated user's budget config", async () => {
    getLocalBudgetConfigMock.mockResolvedValue({
      userId: "user-1",
      items: [],
      updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLocalBudgetConfigMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toMatchObject({
      userId: "user-1",
      items: [],
    });
  });

  it("returns null when no budget config exists", async () => {
    getLocalBudgetConfigMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(null);
  });

  it("saves a complete budget config for writable users", async () => {
    saveLocalBudgetConfigMock.mockResolvedValue({
      userId: "user-1",
      items: [],
      updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    });

    const response = await PUT(
      createJsonRequest({
        items: [
          {
            id: "budget-1",
            scope: "type",
            expenseType: "fixed",
            monthlyAmount: 900,
            order: 0,
          },
        ],
      })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(saveLocalBudgetConfigMock).toHaveBeenCalledWith("user-1", [
      {
        id: "budget-1",
        scope: "type",
        expenseType: "fixed",
        monthlyAmount: 900,
        order: 0,
      },
    ]);
  });

  it("rejects invalid budget payloads", async () => {
    const response = await PUT(
      createJsonRequest({
        items: [
          {
            id: "budget-1",
            scope: "type",
            expenseType: "income",
            monthlyAmount: -1,
            order: 0,
          },
        ],
      })
    );

    expect(response.status).toBe(400);
    expect(saveLocalBudgetConfigMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the user is not authenticated", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
  });

  it("blocks budget writes for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await PUT(createJsonRequest({ items: [] }));

    expect(response.status).toBe(403);
    expect(saveLocalBudgetConfigMock).not.toHaveBeenCalled();
  });
});

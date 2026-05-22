import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalExpenseMock,
  deleteLocalExpenseMock,
  listLocalExpensesMock,
  requireUserSessionMock,
  updateLocalExpenseMock,
  getLocalMonthlyExpenseSummaryMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalExpenseMock: vi.fn(),
  deleteLocalExpenseMock: vi.fn(),
  getLocalMonthlyExpenseSummaryMock: vi.fn(),
  listLocalExpensesMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalExpenseMock: vi.fn(),
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

vi.mock("@/lib/server/cashflow/localExpenseService", () => ({
  createLocalExpense: createLocalExpenseMock,
  deleteLocalExpense: deleteLocalExpenseMock,
  getLocalMonthlyExpenseSummary: getLocalMonthlyExpenseSummaryMock,
  listLocalExpenses: listLocalExpensesMock,
  updateLocalExpense: updateLocalExpenseMock,
}));

import { GET, POST } from "@/app/api/expenses/route";
import { DELETE, PUT } from "@/app/api/expenses/[expenseId]/route";
import { GET as GET_SUMMARY } from "@/app/api/expenses/summary/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const params = Promise.resolve({ expenseId: "expense-1" });

function createJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local expenses routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("lists expenses for the authenticated user", async () => {
    listLocalExpensesMock.mockResolvedValue([{ id: "expense-1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listLocalExpensesMock).toHaveBeenCalledWith("user-1", {});
    await expect(response.json()).resolves.toEqual([{ id: "expense-1" }]);
  });

  it("passes validated query filters when listing expenses", async () => {
    listLocalExpensesMock.mockResolvedValue([]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/expenses?limit=25&cursor=expense-10&from=2026-01-01T00:00:00.000Z&to=2026-01-31T23:59:59.999Z&type=variable"
      )
    );

    expect(response.status).toBe(200);
    expect(listLocalExpensesMock).toHaveBeenCalledWith("user-1", {
      limit: 25,
      cursor: "expense-10",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-31T23:59:59.999Z"),
      type: "variable",
    });
  });

  it("rejects invalid expense list query filters", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/expenses?limit=1000&type=unknown")
    );

    expect(response.status).toBe(400);
    expect(listLocalExpensesMock).not.toHaveBeenCalled();
  });

  it("returns 401 when listing without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("creates expenses for writable users", async () => {
    createLocalExpenseMock.mockResolvedValue({ id: "expense-1" });

    const response = await POST(
      createJsonRequest("http://localhost/api/expenses", {
        type: "variable",
        categoryId: "category-1",
        categoryName: "Spesa",
        amount: 50,
        currency: "EUR",
        date: "2026-05-17T00:00:00.000Z",
      })
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalExpenseMock).toHaveBeenCalledWith("user-1", {
      type: "variable",
      categoryId: "category-1",
      categoryName: "Spesa",
      amount: 50,
      currency: "EUR",
      date: new Date("2026-05-17T00:00:00.000Z"),
    });
  });

  it("rejects invalid expense payloads", async () => {
    const response = await POST(
      createJsonRequest("http://localhost/api/expenses", {
        type: "variable",
        categoryId: "category-1",
        categoryName: "Spesa",
        amount: 50,
        currency: "EUR",
        date: "not-a-date",
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalExpenseMock).not.toHaveBeenCalled();
  });

  it("updates expenses for writable users", async () => {
    updateLocalExpenseMock.mockResolvedValue({ id: "expense-1" });

    const response = await PUT(
      createJsonRequest("http://localhost/api/expenses/expense-1", {
        type: "fixed",
        categoryId: "category-1",
        categoryName: "Casa",
        amount: 950,
        currency: "EUR",
        date: "2026-05-17T00:00:00.000Z",
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(updateLocalExpenseMock).toHaveBeenCalledWith(
      "user-1",
      "expense-1",
      expect.objectContaining({
        amount: 950,
        date: new Date("2026-05-17T00:00:00.000Z"),
      })
    );
  });

  it("returns 404 when updating a non-owned expense", async () => {
    updateLocalExpenseMock.mockResolvedValue(null);

    const response = await PUT(
      createJsonRequest("http://localhost/api/expenses/expense-1", {
        type: "fixed",
        categoryId: "category-1",
        categoryName: "Casa",
        amount: 950,
        currency: "EUR",
        date: "2026-05-17T00:00:00.000Z",
      }),
      { params }
    );

    expect(response.status).toBe(404);
  });

  it("deletes expenses for writable users", async () => {
    deleteLocalExpenseMock.mockResolvedValue(true);

    const response = await DELETE(
      new NextRequest("http://localhost/api/expenses/expense-1", {
        method: "DELETE",
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(deleteLocalExpenseMock).toHaveBeenCalledWith("user-1", "expense-1");
  });

  it("returns monthly summaries for the authenticated user", async () => {
    getLocalMonthlyExpenseSummaryMock.mockResolvedValue({
      year: 2026,
      month: 5,
      totalIncome: 3000,
      totalExpenses: 1000,
      netBalance: 2000,
      byCategory: {},
      byType: {
        fixed: { total: 0, count: 0 },
        variable: { total: 0, count: 0 },
        debt: { total: 0, count: 0 },
        income: { total: 3000, count: 1 },
      },
    });

    const response = await GET_SUMMARY(
      new NextRequest("http://localhost/api/expenses/summary?year=2026&month=5")
    );

    expect(response.status).toBe(200);
    expect(getLocalMonthlyExpenseSummaryMock).toHaveBeenCalledWith("user-1", 2026, 5);
    await expect(response.json()).resolves.toMatchObject({
      year: 2026,
      month: 5,
      netBalance: 2000,
    });
  });

  it("rejects invalid monthly summary query params", async () => {
    const response = await GET_SUMMARY(
      new NextRequest("http://localhost/api/expenses/summary?year=2026&month=13")
    );

    expect(response.status).toBe(400);
    expect(getLocalMonthlyExpenseSummaryMock).not.toHaveBeenCalled();
  });
});

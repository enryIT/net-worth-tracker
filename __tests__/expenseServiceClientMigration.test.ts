import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Expense, ExpenseFormData } from "@/types/expenses";

const {
  addDocMock,
  appendHouseholdAuditEntrySafeMock,
  authenticatedFetchMock,
  collectionMock,
  deleteDocMock,
  docMock,
  getDocMock,
  getDocsMock,
  invalidateDashboardOverviewSummaryMock,
  orderByMock,
  queryMock,
  timestampFromDateMock,
  timestampNowMock,
  updateDocMock,
  whereMock,
  writeBatchMock,
} = vi.hoisted(() => ({
  addDocMock: vi.fn(),
  appendHouseholdAuditEntrySafeMock: vi.fn(),
  authenticatedFetchMock: vi.fn(),
  collectionMock: vi.fn(),
  deleteDocMock: vi.fn(),
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  getDocsMock: vi.fn(),
  invalidateDashboardOverviewSummaryMock: vi.fn(),
  orderByMock: vi.fn(),
  queryMock: vi.fn(),
  timestampFromDateMock: vi.fn(),
  timestampNowMock: vi.fn(),
  updateDocMock: vi.fn(),
  whereMock: vi.fn(),
  writeBatchMock: vi.fn(),
}));

vi.mock("@/lib/utils/authFetch", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

vi.mock("@/lib/services/dashboardOverviewInvalidation", () => ({
  invalidateDashboardOverviewSummary: invalidateDashboardOverviewSummaryMock,
}));

vi.mock("@/lib/services/householdService", () => ({
  appendHouseholdAuditEntrySafe: appendHouseholdAuditEntrySafeMock,
}));

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  addDoc: addDocMock,
  collection: collectionMock,
  deleteDoc: deleteDocMock,
  doc: docMock,
  getDoc: getDocMock,
  getDocs: getDocsMock,
  orderBy: orderByMock,
  query: queryMock,
  Timestamp: {
    fromDate: timestampFromDateMock,
    now: timestampNowMock,
  },
  updateDoc: updateDocMock,
  where: whereMock,
  writeBatch: writeBatchMock,
}));

import {
  createExpense,
  deleteExpense,
  deleteInstallmentExpenses,
  deleteRecurringExpenses,
  getAllExpenses,
  getExpenseById,
  getExpensesByDateRange,
  getExpensesByInstallmentParentId,
  getExpensesByMonth,
  getExpensesByRecurringParentId,
  updateExpense,
  updateExpensesCategoryName,
  updateExpensesSubCategoryName,
  updateExpensesType,
} from "@/lib/services/expenseService";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function expectNoFirestoreCalls(): void {
  expect(collectionMock).not.toHaveBeenCalled();
  expect(docMock).not.toHaveBeenCalled();
  expect(getDocMock).not.toHaveBeenCalled();
  expect(getDocsMock).not.toHaveBeenCalled();
  expect(addDocMock).not.toHaveBeenCalled();
  expect(updateDocMock).not.toHaveBeenCalled();
  expect(deleteDocMock).not.toHaveBeenCalled();
  expect(queryMock).not.toHaveBeenCalled();
  expect(whereMock).not.toHaveBeenCalled();
  expect(orderByMock).not.toHaveBeenCalled();
  expect(writeBatchMock).not.toHaveBeenCalled();
  expect(timestampFromDateMock).not.toHaveBeenCalled();
  expect(timestampNowMock).not.toHaveBeenCalled();
}

function createExpensePayload(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    userId: "session-user",
    type: "variable",
    categoryId: "11111111-1111-1111-1111-111111111111",
    categoryName: "Spesa",
    amount: -45,
    currency: "EUR",
    date: "2026-06-01T00:00:00.000Z" as unknown as Date,
    createdAt: "2026-06-01T00:00:00.000Z" as unknown as Date,
    updatedAt: "2026-06-01T00:00:00.000Z" as unknown as Date,
    ...overrides,
  };
}

const baseFormData: ExpenseFormData = {
  type: "variable",
  categoryId: "11111111-1111-1111-1111-111111111111",
  subCategoryId: "sub-1",
  amount: 45,
  currency: "EUR",
  date: new Date("2026-06-01T00:00:00.000Z"),
  notes: "Supermercato",
};

describe("expenseService Firebase-to-local API migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the client wrapper free from firebase runtime imports", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/services/expenseService.ts"), "utf8");

    expect(source).not.toMatch(/firebase\/firestore|@\/lib\/firebase\/config/);
  });

  it("loads all expenses through /api/expenses", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse([
      createExpensePayload(),
    ]));

    const expenses = await getAllExpenses("legacy-user");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/expenses", { method: "GET" });
    expect(expenses[0]?.id).toBe("expense-1");
    expect(expenses[0]?.date).toBeInstanceOf(Date);
    expectNoFirestoreCalls();
  });

  it("loads monthly expenses through /api/expenses date filters", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse([
      createExpensePayload(),
    ]));

    const expenses = await getExpensesByMonth("legacy-user", 2026, 6);

    const call = authenticatedFetchMock.mock.calls[0];
    expect(call[0]).toContain("/api/expenses?from=");
    expect(call[0]).toContain("&to=");
    expect(call[1]).toEqual({ method: "GET" });
    expect(expenses[0]?.date).toBeInstanceOf(Date);
    expectNoFirestoreCalls();
  });

  it("loads date-range expenses through /api/expenses date filters", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse([
      createExpensePayload(),
    ]));

    const expenses = await getExpensesByDateRange(
      "legacy-user",
      new Date("2026-05-01T00:00:00.000Z"),
      new Date("2026-05-31T23:59:59.999Z")
    );

    const call = authenticatedFetchMock.mock.calls[0];
    expect(call[0]).toContain("/api/expenses?from=");
    expect(call[0]).toContain("&to=");
    expect(call[1]).toEqual({ method: "GET" });
    expect(expenses[0]?.date).toBeInstanceOf(Date);
    expectNoFirestoreCalls();
  });

  it("loads one expense through /api/expenses/[expenseId]", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(createExpensePayload()));

    const expense = await getExpenseById("expense-1");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/expenses/expense-1", {
      method: "GET",
    });
    expect(expense?.id).toBe("expense-1");
    expectNoFirestoreCalls();
  });

  it("creates one expense through /api/expenses", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      jsonResponse(createExpensePayload({ id: "expense-2" }), { status: 201 })
    );

    const created = await createExpense(
      "legacy-user",
      baseFormData,
      "Spesa",
      "Supermercato"
    );

    expect(created).toBe("expense-2");
    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...baseFormData,
        categoryName: "Spesa",
        subCategoryName: "Supermercato",
      }),
    });
    expect(invalidateDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "legacy-user",
      "expense_created"
    );
    expect(appendHouseholdAuditEntrySafeMock).toHaveBeenCalled();
    expectNoFirestoreCalls();
  });

  it("updates expenses through /api/expenses/[expenseId]", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(createExpensePayload()))
      .mockResolvedValueOnce(jsonResponse(createExpensePayload({ notes: "Nuova" })));

    await updateExpense("expense-1", { notes: "Nuova" }, "Spesa", "Supermercato");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/expenses/expense-1", {
      method: "GET",
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(2, "/api/expenses/expense-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expectNoFirestoreCalls();
  });

  it("deletes expenses through /api/expenses/[expenseId]", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(createExpensePayload()))
      .mockResolvedValueOnce(jsonResponse({ success: true }));

    await deleteExpense("expense-1");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/expenses/expense-1", {
      method: "GET",
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(2, "/api/expenses/expense-1", {
      method: "DELETE",
    });
    expectNoFirestoreCalls();
  });

  it("creates recurring series through repeated /api/expenses writes and returns ids", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(createExpensePayload({ id: "rec-1" }), { status: 201 }))
      .mockResolvedValueOnce(jsonResponse(createExpensePayload({ id: "rec-2" }), { status: 201 }))
      .mockResolvedValueOnce(jsonResponse(createExpensePayload({ id: "rec-3" }), { status: 201 }));

    const result = await createExpense(
      "legacy-user",
      {
        ...baseFormData,
        type: "debt",
        isRecurring: true,
        recurringDay: 5,
        recurringMonths: 3,
      },
      "Mutuo"
    );

    expect(result).toEqual(["rec-1", "rec-2", "rec-3"]);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(3);
    expectNoFirestoreCalls();
  });

  it("creates installment series through repeated /api/expenses writes and returns ids", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(createExpensePayload({ id: "ins-1" }), { status: 201 }))
      .mockResolvedValueOnce(jsonResponse(createExpensePayload({ id: "ins-2" }), { status: 201 }))
      .mockResolvedValueOnce(jsonResponse(createExpensePayload({ id: "ins-3" }), { status: 201 }));

    const result = await createExpense(
      "legacy-user",
      {
        ...baseFormData,
        isInstallment: true,
        installmentMode: "auto",
        installmentCount: 3,
        installmentTotalAmount: 100,
      },
      "Telefonia"
    );

    expect(result).toEqual(["ins-1", "ins-2", "ins-3"]);
    expect(authenticatedFetchMock).toHaveBeenCalledTimes(3);
    expectNoFirestoreCalls();
  });

  it("lists recurring and installment series through /api/expenses filters", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse([createExpensePayload({ recurringParentId: "rec-parent" })]))
      .mockResolvedValueOnce(jsonResponse([createExpensePayload({ installmentParentId: "ins-parent" })]));

    const recurring = await getExpensesByRecurringParentId("rec-parent");
    const installments = await getExpensesByInstallmentParentId("ins-parent");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/expenses?recurringParentId=rec-parent",
      { method: "GET" }
    );
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/expenses?installmentParentId=ins-parent",
      { method: "GET" }
    );
    expect(recurring[0]?.recurringParentId).toBe("rec-parent");
    expect(installments[0]?.installmentParentId).toBe("ins-parent");
    expectNoFirestoreCalls();
  });

  it("deletes recurring and installment series through /api/expenses filters", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ deletedCount: 3 }))
      .mockResolvedValueOnce(jsonResponse({ deletedCount: 2 }));

    await deleteRecurringExpenses("rec-parent");
    await deleteInstallmentExpenses("ins-parent");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/expenses?recurringParentId=rec-parent",
      { method: "DELETE" }
    );
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/expenses?installmentParentId=ins-parent",
      { method: "DELETE" }
    );
    expectNoFirestoreCalls();
  });

  it("routes category/subcategory/type helper updates through the local assignment API", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse({ count: 4 }))
      .mockResolvedValueOnce(jsonResponse({ count: 2 }))
      .mockResolvedValueOnce(jsonResponse({ count: 6 }));

    await updateExpensesCategoryName(
      "category-1",
      "Casa",
      "legacy-user"
    );
    await updateExpensesSubCategoryName(
      "category-1",
      "sub-1",
      "Affitto",
      "legacy-user"
    );
    const count = await updateExpensesType(
      "category-1",
      "variable",
      "income",
      "legacy-user"
    );

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/expenses/category-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateCategoryName",
        categoryId: "category-1",
        newCategoryName: "Casa",
      }),
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(2, "/api/expenses/category-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateSubCategoryName",
        categoryId: "category-1",
        subCategoryId: "sub-1",
        newSubCategoryName: "Affitto",
      }),
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(3, "/api/expenses/category-assignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateCategoryType",
        categoryId: "category-1",
        oldType: "variable",
        newType: "income",
      }),
    });
    expect(count).toBe(6);
    expectNoFirestoreCalls();
  });
});

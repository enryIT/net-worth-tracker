import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    expense: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createLocalExpense,
  deleteLocalExpense,
  getLocalMonthlyExpenseSummary,
  listLocalExpenses,
  listLocalExpensesForCostCenter,
  updateLocalExpense,
} from "@/lib/server/cashflow/localExpenseService";

describe("local expense service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists expenses scoped to a user ordered by date descending", async () => {
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: "expense-1",
        userId: "user-1",
        type: "fixed",
        categoryId: "category-1",
        categoryName: "Casa",
        subCategoryId: null,
        subCategoryName: null,
        amount: -900,
        currency: "EUR",
        date: new Date("2026-05-17T00:00:00.000Z"),
        notes: null,
        link: null,
        metadata: {},
        legacyFirebaseId: null,
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
        updatedAt: new Date("2026-05-17T10:00:00.000Z"),
      },
    ]);

    const expenses = await listLocalExpenses("user-1");

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(expenses[0]).toMatchObject({
      id: "expense-1",
      userId: "user-1",
      type: "fixed",
      categoryName: "Casa",
      amount: -900,
    });
  });

  it("lists expenses with cursor pagination and date filters", async () => {
    prismaMock.expense.findMany.mockResolvedValue([]);

    await listLocalExpenses("user-1", {
      limit: 25,
      cursor: "expense-10",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-01-31T23:59:59.999Z"),
      type: "variable",
    });

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        date: {
          gte: new Date("2026-01-01T00:00:00.000Z"),
          lte: new Date("2026-01-31T23:59:59.999Z"),
        },
        type: "variable",
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 25,
      cursor: { id: "expense-10" },
      skip: 1,
    });
  });

  it("lists expenses scoped to a cost center ordered by date ascending", async () => {
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: "expense-1",
        userId: "user-1",
        type: "variable",
        categoryId: "category-1",
        categoryName: "Auto",
        subCategoryId: null,
        subCategoryName: null,
        amount: -25,
        currency: "EUR",
        date: new Date("2026-05-20T00:00:00.000Z"),
        notes: null,
        link: null,
        costCenterId: "cost-center-1",
        costCenterName: "Automobile",
        metadata: {},
        legacyFirebaseId: null,
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
        updatedAt: new Date("2026-05-17T10:00:00.000Z"),
      },
    ]);

    const expenses = await listLocalExpensesForCostCenter("user-1", "cost-center-1");

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", costCenterId: "cost-center-1" },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    expect(expenses[0]).toMatchObject({
      id: "expense-1",
      userId: "user-1",
      costCenterId: "cost-center-1",
      costCenterName: "Automobile",
    });
  });

  it("creates user-scoped expenses with expense amounts stored negative", async () => {
    prismaMock.expense.create.mockResolvedValue({
      id: "expense-1",
      userId: "user-1",
      type: "variable",
      categoryId: "category-1",
      categoryName: "Spesa",
      subCategoryId: null,
      subCategoryName: null,
      amount: -50,
      currency: "EUR",
      date: new Date("2026-05-17T00:00:00.000Z"),
      notes: "Supermercato",
      link: null,
      metadata: {},
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
      updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    });

    await createLocalExpense("user-1", {
      type: "variable",
      categoryId: "category-1",
      categoryName: "Spesa",
      amount: 50,
      currency: "EUR",
      date: new Date("2026-05-17T00:00:00.000Z"),
      notes: "Supermercato",
    });

    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        type: "variable",
        categoryId: "category-1",
        categoryName: "Spesa",
        subCategoryId: undefined,
        subCategoryName: undefined,
        amount: -50,
        currency: "EUR",
        date: new Date("2026-05-17T00:00:00.000Z"),
        notes: "Supermercato",
        link: undefined,
        metadata: {},
      },
    });
  });

  it("creates user-scoped income with income amounts stored positive", async () => {
    prismaMock.expense.create.mockResolvedValue({
      id: "expense-2",
      userId: "user-1",
      type: "income",
      categoryId: "category-2",
      categoryName: "Stipendio",
      subCategoryId: null,
      subCategoryName: null,
      amount: 3000,
      currency: "EUR",
      date: new Date("2026-05-17T00:00:00.000Z"),
      notes: null,
      link: null,
      metadata: {},
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
      updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    });

    await createLocalExpense("user-1", {
      type: "income",
      categoryId: "category-2",
      categoryName: "Stipendio",
      amount: -3000,
      currency: "EUR",
      date: new Date("2026-05-17T00:00:00.000Z"),
    });

    expect(prismaMock.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 3000,
        }),
      })
    );
  });

  it("updates expenses only when they belong to the user", async () => {
    prismaMock.expense.update.mockResolvedValue({
      id: "expense-1",
      userId: "user-1",
      type: "fixed",
      categoryId: "category-1",
      categoryName: "Casa",
      subCategoryId: null,
      subCategoryName: null,
      amount: -950,
      currency: "EUR",
      date: new Date("2026-05-17T00:00:00.000Z"),
      notes: null,
      link: null,
      metadata: {},
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
      updatedAt: new Date("2026-05-17T11:00:00.000Z"),
    });

    const expense = await updateLocalExpense("user-1", "expense-1", {
      type: "fixed",
      categoryId: "category-1",
      categoryName: "Casa",
      amount: 950,
      currency: "EUR",
      date: new Date("2026-05-17T00:00:00.000Z"),
    });

    expect(prismaMock.expense.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "expense-1",
          userId: "user-1",
        },
      },
      data: expect.objectContaining({
        amount: -950,
      }),
    });
    expect(expense?.amount).toBe(-950);
  });

  it("deletes only expenses owned by the user", async () => {
    prismaMock.expense.deleteMany.mockResolvedValue({ count: 1 });

    const deleted = await deleteLocalExpense("user-1", "expense-1");

    expect(prismaMock.expense.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "expense-1",
        userId: "user-1",
      },
    });
    expect(deleted).toBe(true);
  });

  it("calculates a monthly summary from user-scoped monthly expenses", async () => {
    prismaMock.expense.findMany.mockResolvedValue([
      {
        id: "expense-1",
        userId: "user-1",
        type: "income",
        categoryId: "salary",
        categoryName: "Stipendio",
        subCategoryId: null,
        subCategoryName: null,
        amount: 3000,
        currency: "EUR",
        date: new Date("2026-05-02T00:00:00.000Z"),
        notes: null,
        link: null,
        metadata: {},
        legacyFirebaseId: null,
        createdAt: new Date("2026-05-02T10:00:00.000Z"),
        updatedAt: new Date("2026-05-02T10:00:00.000Z"),
      },
      {
        id: "expense-2",
        userId: "user-1",
        type: "fixed",
        categoryId: "rent",
        categoryName: "Affitto",
        subCategoryId: null,
        subCategoryName: null,
        amount: -900,
        currency: "EUR",
        date: new Date("2026-05-03T00:00:00.000Z"),
        notes: null,
        link: null,
        metadata: {},
        legacyFirebaseId: null,
        createdAt: new Date("2026-05-03T10:00:00.000Z"),
        updatedAt: new Date("2026-05-03T10:00:00.000Z"),
      },
      {
        id: "expense-3",
        userId: "user-1",
        type: "variable",
        categoryId: "food",
        categoryName: "Spesa",
        subCategoryId: null,
        subCategoryName: null,
        amount: -100,
        currency: "EUR",
        date: new Date("2026-05-04T00:00:00.000Z"),
        notes: null,
        link: null,
        metadata: {},
        legacyFirebaseId: null,
        createdAt: new Date("2026-05-04T10:00:00.000Z"),
        updatedAt: new Date("2026-05-04T10:00:00.000Z"),
      },
    ]);

    const summary = await getLocalMonthlyExpenseSummary("user-1", 2026, 5);

    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        date: {
          gte: new Date("2026-05-01T00:00:00.000Z"),
          lt: new Date("2026-06-01T00:00:00.000Z"),
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(summary).toEqual({
      year: 2026,
      month: 5,
      totalIncome: 3000,
      totalExpenses: 1000,
      netBalance: 2000,
      byCategory: {
        salary: { categoryName: "Stipendio", total: 3000, count: 1 },
        rent: { categoryName: "Affitto", total: -900, count: 1 },
        food: { categoryName: "Spesa", total: -100, count: 1 },
      },
      byType: {
        fixed: { total: 900, count: 1 },
        variable: { total: 100, count: 1 },
        debt: { total: 0, count: 0 },
        income: { total: 3000, count: 1 },
      },
    });
  });
});

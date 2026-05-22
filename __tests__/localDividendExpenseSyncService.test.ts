import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    dividend: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    expense: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import { syncLocalDividendExpenses } from "@/lib/server/dividends/localDividendExpenseSyncService";

const paidDividend = {
  id: "dividend-1",
  userId: "user-1",
  assetId: "asset-1",
  assetTicker: "ENI",
  assetName: "Eni",
  paymentDate: new Date("2026-05-17T00:00:00.000Z"),
  netAmount: 37,
  netAmountEur: null,
  currency: "EUR",
  notes: "Cedola ordinaria",
  expenseId: null,
};

describe("local dividend expense sync service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates income expenses for paid unsynced dividends and links them back", async () => {
    prismaMock.dividend.findMany.mockResolvedValue([paidDividend]);
    prismaMock.expense.create.mockResolvedValue({ id: "expense-1" });
    prismaMock.dividend.update.mockResolvedValue({ ...paidDividend, expenseId: "expense-1" });

    const result = await syncLocalDividendExpenses("user-1", {
      categoryId: "category-1",
      categoryName: "Dividendi",
      subCategoryId: "subcategory-1",
      subCategoryName: "Azioni",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(prismaMock.dividend.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    });
    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        type: "income",
        categoryId: "category-1",
        categoryName: "Dividendi",
        subCategoryId: "subcategory-1",
        subCategoryName: "Azioni",
        amount: 37,
        currency: "EUR",
        date: new Date("2026-05-17T00:00:00.000Z"),
        metadata: expect.objectContaining({
          linkedInvestmentAssetId: "asset-1",
          linkedInvestmentAssetName: "Eni",
          dividendId: "dividend-1",
        }),
      }),
    });
    expect(prismaMock.dividend.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "dividend-1", userId: "user-1" } },
      data: { expenseId: "expense-1" },
    });
    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });
  });

  it("skips already linked and future dividends", async () => {
    prismaMock.dividend.findMany.mockResolvedValue([
      { ...paidDividend, id: "linked", expenseId: "expense-existing" },
      {
        ...paidDividend,
        id: "future",
        paymentDate: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]);

    const result = await syncLocalDividendExpenses("user-1", {
      categoryId: "category-1",
      categoryName: "Dividendi",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(prismaMock.expense.create).not.toHaveBeenCalled();
    expect(prismaMock.dividend.update).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, skipped: 2, failed: 0 });
  });

  it("uses EUR converted net amount for foreign currency dividends", async () => {
    prismaMock.dividend.findMany.mockResolvedValue([
      {
        ...paidDividend,
        currency: "USD",
        netAmount: 100,
        netAmountEur: 92,
      },
    ]);
    prismaMock.expense.create.mockResolvedValue({ id: "expense-1" });
    prismaMock.dividend.update.mockResolvedValue({ ...paidDividend, expenseId: "expense-1" });

    await syncLocalDividendExpenses("user-1", {
      categoryId: "category-1",
      categoryName: "Dividendi",
      today: new Date("2026-06-01T00:00:00.000Z"),
    });

    expect(prismaMock.expense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 92,
        currency: "EUR",
        notes: expect.stringContaining("100.00 USD convertiti"),
      }),
    });
  });
});

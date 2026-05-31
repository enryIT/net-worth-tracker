import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    expense: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    expenseCategory: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    monthlySnapshot: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  deleteLocalDummyCategories,
  deleteLocalDummyData,
  deleteLocalDummyExpenses,
  deleteLocalDummySnapshots,
  getLocalDummyDataCount,
} from "@/lib/server/dummy/localDummyDataService";

describe("local dummy data service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts dummy data with user scoping and prefix filters", async () => {
    prismaMock.monthlySnapshot.count.mockResolvedValue(3);
    prismaMock.expense.count.mockResolvedValue(5);
    prismaMock.expenseCategory.count.mockResolvedValue(2);

    const result = await getLocalDummyDataCount("user-1");

    expect(prismaMock.monthlySnapshot.count).toHaveBeenCalledWith({
      where: { userId: "user-1", isDummy: true },
    });
    expect(prismaMock.expense.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        legacyFirebaseId: { startsWith: "dummy-" },
      },
    });
    expect(prismaMock.expenseCategory.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        legacyFirebaseId: { startsWith: "dummy-category-" },
      },
    });
    expect(result).toEqual({
      snapshots: 3,
      expenses: 5,
      categories: 2,
      total: 10,
    });
  });

  it("deletes dummy snapshots scoped to the current user", async () => {
    prismaMock.monthlySnapshot.deleteMany.mockResolvedValue({ count: 4 });

    await expect(deleteLocalDummySnapshots("user-1")).resolves.toBe(4);

    expect(prismaMock.monthlySnapshot.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", isDummy: true },
    });
  });

  it("deletes dummy expenses using the legacy id prefix filter", async () => {
    prismaMock.expense.deleteMany.mockResolvedValue({ count: 6 });

    await expect(deleteLocalDummyExpenses("user-1")).resolves.toBe(6);

    expect(prismaMock.expense.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        legacyFirebaseId: { startsWith: "dummy-" },
      },
    });
  });

  it("deletes dummy categories using the legacy id prefix filter", async () => {
    prismaMock.expenseCategory.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteLocalDummyCategories("user-1")).resolves.toBe(1);

    expect(prismaMock.expenseCategory.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        legacyFirebaseId: { startsWith: "dummy-category-" },
      },
    });
  });

  it("deletes all dummy data and returns totals", async () => {
    prismaMock.monthlySnapshot.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.expense.deleteMany.mockResolvedValue({ count: 7 });
    prismaMock.expenseCategory.deleteMany.mockResolvedValue({ count: 3 });

    await expect(deleteLocalDummyData("user-1")).resolves.toEqual({
      snapshots: 2,
      expenses: 7,
      categories: 3,
      total: 12,
    });
  });
});

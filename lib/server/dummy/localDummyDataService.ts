import "server-only";

import { prisma } from "@/lib/server/prisma";

export type LocalDummyDataCount = {
  snapshots: number;
  expenses: number;
  categories: number;
  total: number;
};

const DUMMY_EXPENSE_PREFIX = "dummy-";
const DUMMY_CATEGORY_PREFIX = "dummy-category-";

export async function getLocalDummyDataCount(
  userId: string
): Promise<LocalDummyDataCount> {
  const [snapshots, expenses, categories] = await Promise.all([
    prisma.monthlySnapshot.count({
      where: { userId, isDummy: true },
    }),
    prisma.expense.count({
      where: {
        userId,
        legacyFirebaseId: { startsWith: DUMMY_EXPENSE_PREFIX },
      },
    }),
    prisma.expenseCategory.count({
      where: {
        userId,
        legacyFirebaseId: { startsWith: DUMMY_CATEGORY_PREFIX },
      },
    }),
  ]);

  return {
    snapshots,
    expenses,
    categories,
    total: snapshots + expenses + categories,
  };
}

export async function deleteLocalDummySnapshots(userId: string): Promise<number> {
  const result = await prisma.monthlySnapshot.deleteMany({
    where: { userId, isDummy: true },
  });

  return result.count;
}

export async function deleteLocalDummyExpenses(userId: string): Promise<number> {
  const result = await prisma.expense.deleteMany({
    where: {
      userId,
      legacyFirebaseId: { startsWith: DUMMY_EXPENSE_PREFIX },
    },
  });

  return result.count;
}

export async function deleteLocalDummyCategories(userId: string): Promise<number> {
  const result = await prisma.expenseCategory.deleteMany({
    where: {
      userId,
      legacyFirebaseId: { startsWith: DUMMY_CATEGORY_PREFIX },
    },
  });

  return result.count;
}

export async function deleteLocalDummyData(
  userId: string
): Promise<LocalDummyDataCount> {
  const [snapshots, expenses, categories] = await Promise.all([
    deleteLocalDummySnapshots(userId),
    deleteLocalDummyExpenses(userId),
    deleteLocalDummyCategories(userId),
  ]);

  return {
    snapshots,
    expenses,
    categories,
    total: snapshots + expenses + categories,
  };
}

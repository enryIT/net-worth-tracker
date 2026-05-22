import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type {
  ExpenseCategory,
  ExpenseCategoryFormData,
  ExpenseSubCategory,
} from "@/types/expenses";

type ExpenseCategoryRow = {
  id: string;
  userId: string;
  name: string;
  type: string;
  color: string | null;
  icon: string | null;
  subCategories: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export async function listLocalExpenseCategories(
  userId: string
): Promise<ExpenseCategory[]> {
  const rows = await prisma.expenseCategory.findMany({
    where: { userId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return rows.map(mapExpenseCategoryRow);
}

export async function createLocalExpenseCategory(
  userId: string,
  categoryData: ExpenseCategoryFormData
): Promise<ExpenseCategory> {
  const row = await prisma.expenseCategory.create({
    data: {
      userId,
      ...buildCategoryData(categoryData),
    },
  });

  return mapExpenseCategoryRow(row);
}

export async function updateLocalExpenseCategory(
  userId: string,
  categoryId: string,
  categoryData: ExpenseCategoryFormData
): Promise<ExpenseCategory | null> {
  try {
    const row = await prisma.expenseCategory.update({
      where: {
        id_userId: {
          id: categoryId,
          userId,
        },
      },
      data: buildCategoryData(categoryData),
    });

    return mapExpenseCategoryRow(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }

    throw error;
  }
}

export async function deleteLocalExpenseCategory(
  userId: string,
  categoryId: string
): Promise<boolean> {
  const result = await prisma.expenseCategory.deleteMany({
    where: {
      id: categoryId,
      userId,
    },
  });

  return result.count > 0;
}

type LocalExpenseCategoryWriteData = {
  name: string;
  type: string;
  color?: string;
  icon?: string;
  subCategories: Prisma.InputJsonValue;
};

function buildCategoryData(
  categoryData: ExpenseCategoryFormData
): LocalExpenseCategoryWriteData {
  return {
    name: categoryData.name,
    type: categoryData.type,
    color: categoryData.color,
    icon: categoryData.icon,
    subCategories: (categoryData.subCategories ?? []) as unknown as Prisma.InputJsonValue,
  };
}

function mapExpenseCategoryRow(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type as ExpenseCategory["type"],
    color: row.color ?? undefined,
    icon: row.icon ?? undefined,
    subCategories: Array.isArray(row.subCategories)
      ? (row.subCategories as unknown as ExpenseSubCategory[])
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

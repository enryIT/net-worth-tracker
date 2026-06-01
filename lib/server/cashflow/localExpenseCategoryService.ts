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
  categoryData: ExpenseCategoryFormData & { legacyFirebaseId?: string }
): Promise<ExpenseCategory> {
  const writeData = buildCategoryData(categoryData);

  if (categoryData.legacyFirebaseId) {
    const row = await prisma.expenseCategory.upsert({
      where: {
        userId_legacyFirebaseId: {
          userId,
          legacyFirebaseId: categoryData.legacyFirebaseId,
        },
      },
      create: {
        userId,
        ...writeData,
      },
      update: omitLegacyFirebaseId(writeData),
    });

    return mapExpenseCategoryRow(row);
  }

  const row = await prisma.expenseCategory.create({
    data: {
      userId,
      ...writeData,
    },
  });

  return mapExpenseCategoryRow(row);
}

export async function updateLocalExpenseCategory(
  userId: string,
  categoryId: string,
  categoryData: ExpenseCategoryFormData
): Promise<ExpenseCategory | null> {
  const existingRow = await prisma.expenseCategory.findUnique({
    where: {
      id_userId: {
        id: categoryId,
        userId,
      },
    },
  });

  if (!existingRow) {
    return null;
  }

  const existingCategory = mapExpenseCategoryRow(existingRow);
  await cascadeExpenseCategoryChanges(userId, categoryId, existingCategory, categoryData);

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
  legacyFirebaseId?: string;
};

async function cascadeExpenseCategoryChanges(
  userId: string,
  categoryId: string,
  existingCategory: ExpenseCategory,
  categoryData: ExpenseCategoryFormData
): Promise<void> {
  if (existingCategory.name !== categoryData.name) {
    await prisma.expense.updateMany({
      where: { userId, categoryId },
      data: { categoryName: categoryData.name },
    });
  }

  if (existingCategory.type !== categoryData.type) {
    await prisma.expense.updateMany({
      where: { userId, categoryId },
      data: {
        type: categoryData.type,
        ...(needsSignFlip(existingCategory.type, categoryData.type)
          ? { amount: { multiply: -1 } }
          : {}),
      },
    });
  }

  for (const subCategory of categoryData.subCategories ?? []) {
    const existingSubCategory = existingCategory.subCategories.find(
      currentSubCategory => currentSubCategory.id === subCategory.id
    );

    if (existingSubCategory && existingSubCategory.name !== subCategory.name) {
      await prisma.expense.updateMany({
        where: { userId, categoryId, subCategoryId: subCategory.id },
        data: { subCategoryName: subCategory.name },
      });
    }
  }
}

function needsSignFlip(
  oldType: ExpenseCategory["type"],
  newType: ExpenseCategory["type"]
): boolean {
  return (oldType === "income") !== (newType === "income");
}

function buildCategoryData(
  categoryData: ExpenseCategoryFormData & { legacyFirebaseId?: string }
): LocalExpenseCategoryWriteData {
  const data: LocalExpenseCategoryWriteData = {
    name: categoryData.name,
    type: categoryData.type,
    color: categoryData.color,
    icon: categoryData.icon,
    subCategories: (categoryData.subCategories ?? []) as unknown as Prisma.InputJsonValue,
  };

  if (categoryData.legacyFirebaseId) {
    data.legacyFirebaseId = categoryData.legacyFirebaseId;
  }

  return data;
}

function omitLegacyFirebaseId(
  data: LocalExpenseCategoryWriteData
): Omit<LocalExpenseCategoryWriteData, "legacyFirebaseId"> {
  return {
    name: data.name,
    type: data.type,
    color: data.color,
    icon: data.icon,
    subCategories: data.subCategories,
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

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type { BudgetConfig, BudgetItem } from "@/types/budget";

type BudgetConfigRow = {
  userId: string;
  items: Prisma.JsonValue;
  updatedAt: Date;
};

export async function getLocalBudgetConfig(
  userId: string
): Promise<BudgetConfig | null> {
  const row = await prisma.budgetConfig.findUnique({
    where: { userId },
  });

  return row ? mapBudgetConfigRow(row) : null;
}

export async function saveLocalBudgetConfig(
  userId: string,
  items: BudgetItem[]
): Promise<BudgetConfig> {
  const cleanItems = sanitizeBudgetItems(items);
  const row = await prisma.budgetConfig.upsert({
    where: { userId },
    create: {
      userId,
      items: cleanItems,
    },
    update: {
      items: cleanItems,
    },
  });

  return mapBudgetConfigRow(row);
}

function sanitizeBudgetItems(items: BudgetItem[]): Prisma.InputJsonValue {
  return items.map((item) => {
    const clean: Record<string, unknown> = {
      id: item.id,
      scope: item.scope,
      monthlyAmount: item.monthlyAmount,
      order: item.order,
    };

    if (item.expenseType != null) clean.expenseType = item.expenseType;
    if (item.categoryId != null) clean.categoryId = item.categoryId;
    if (item.categoryName != null) clean.categoryName = item.categoryName;
    if (item.subCategoryId != null) clean.subCategoryId = item.subCategoryId;
    if (item.subCategoryName != null) clean.subCategoryName = item.subCategoryName;
    if (item.attributionProfileId != null) {
      clean.attributionProfileId = item.attributionProfileId;
    }
    if (item.attributionProfileName != null) {
      clean.attributionProfileName = item.attributionProfileName;
    }
    if (item.attributionSplits != null) {
      clean.attributionSplits = item.attributionSplits;
    }

    return clean;
  }) as Prisma.InputJsonValue;
}

function mapBudgetConfigRow(row: BudgetConfigRow): BudgetConfig {
  return {
    userId: row.userId,
    items: Array.isArray(row.items) ? (row.items as unknown as BudgetItem[]) : [],
    updatedAt: row.updatedAt,
  };
}

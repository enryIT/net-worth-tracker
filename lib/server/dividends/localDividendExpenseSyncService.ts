import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";

export type LocalDividendExpenseSyncInput = {
  dividendIds?: string[];
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
  today?: Date;
};

export type LocalDividendExpenseSyncResult = {
  created: number;
  skipped: number;
  failed: number;
};

type DividendForExpenseSync = {
  id: string;
  userId: string;
  assetId: string;
  assetTicker: string;
  assetName: string;
  paymentDate: Date;
  netAmount: number;
  netAmountEur: number | null;
  currency: string;
  notes: string | null;
  expenseId: string | null;
};

export async function syncLocalDividendExpenses(
  userId: string,
  input: LocalDividendExpenseSyncInput
): Promise<LocalDividendExpenseSyncResult> {
  const today = startOfDay(input.today ?? new Date());
  const dividends = await prisma.dividend.findMany({
    where: buildDividendWhere(userId, input.dividendIds),
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
  });
  const result: LocalDividendExpenseSyncResult = {
    created: 0,
    skipped: 0,
    failed: 0,
  };

  for (const dividend of dividends) {
    if (dividend.expenseId || dividend.paymentDate > today) {
      result.skipped += 1;
      continue;
    }

    try {
      const expense = await createExpenseForDividend(dividend, input);
      await prisma.dividend.update({
        where: { id_userId: { id: dividend.id, userId } },
        data: { expenseId: expense.id },
      });
      result.created += 1;
    } catch (error) {
      console.error("[LOCAL_DIVIDEND_EXPENSE_SYNC_ITEM_ERROR]", error);
      result.failed += 1;
    }
  }

  return result;
}

function buildDividendWhere(
  userId: string,
  dividendIds?: string[]
): Prisma.DividendWhereInput {
  return {
    userId,
    ...(dividendIds && dividendIds.length > 0 ? { id: { in: dividendIds } } : {}),
  };
}

async function createExpenseForDividend(
  dividend: DividendForExpenseSync,
  input: LocalDividendExpenseSyncInput
) {
  const useEurAmount =
    dividend.currency.toUpperCase() !== "EUR" && dividend.netAmountEur !== null;
  const amount = useEurAmount ? dividend.netAmountEur! : dividend.netAmount;
  const currency = useEurAmount ? "EUR" : dividend.currency;

  return prisma.expense.create({
    data: {
      userId: dividend.userId,
      type: "income",
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      subCategoryId: input.subCategoryId,
      subCategoryName: input.subCategoryName,
      amount,
      currency,
      date: dividend.paymentDate,
      notes: buildExpenseNotes(dividend, useEurAmount),
      metadata: {
        linkedInvestmentAssetId: dividend.assetId,
        linkedInvestmentAssetName: dividend.assetName,
        dividendId: dividend.id,
      },
    },
  });
}

function buildExpenseNotes(
  dividend: DividendForExpenseSync,
  useEurAmount: boolean
) {
  const conversionNote = useEurAmount
    ? ` (${dividend.netAmount.toFixed(2)} ${dividend.currency} convertiti)`
    : "";
  const userNotes = dividend.notes ? ` | ${dividend.notes}` : "";

  return `Dividendo ${dividend.assetTicker} - ${dividend.assetName}${conversionNote}${userNotes}`;
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type {
  Expense,
  ExpenseType,
  LinkedInvestmentOperationType,
  MonthlyExpenseSummary,
} from "@/types/expenses";
import type { OwnershipSplit } from "@/types/household";

export type LocalExpenseInput = {
  type: ExpenseType;
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
  amount: number;
  currency: string;
  date: Date;
  notes?: string;
  link?: string;
  isRecurring?: boolean;
  recurringDay?: number;
  recurringParentId?: string;
  isInstallment?: boolean;
  installmentParentId?: string;
  installmentNumber?: number;
  installmentTotal?: number;
  installmentTotalAmount?: number;
  linkedCashAssetId?: string;
  linkedInvestmentAssetId?: string;
  linkedInvestmentAssetName?: string;
  linkedInvestmentQuantityDelta?: number;
  investmentOperationId?: string;
  investmentOperationType?: LinkedInvestmentOperationType;
  investmentOperationPricePerUnit?: number;
  investmentOperationFees?: number;
  investmentOperationTaxes?: number;
  costCenterId?: string;
  costCenterName?: string;
  attributionProfileId?: string;
  attributionProfileName?: string;
  attributionSplits?: OwnershipSplit[];
};

export type LocalExpenseListOptions = {
  limit?: number;
  cursor?: string;
  from?: Date;
  to?: Date;
  includeEndDate?: boolean;
  type?: ExpenseType;
};

export type LocalExpenseCategoryReassignmentInput = {
  oldCategoryId: string;
  newCategoryId: string;
  newCategoryName: string;
  newSubCategoryId?: string;
  newSubCategoryName?: string;
};

export type LocalExpenseSubCategoryReassignmentInput = {
  categoryId: string;
  oldSubCategoryId: string;
  newSubCategoryId?: string;
  newSubCategoryName?: string;
};

export type LocalExpenseCategoryMoveInput = {
  oldCategoryId: string;
  oldType: ExpenseType;
  newCategoryId: string;
  newCategoryName: string;
  newType: ExpenseType;
  newSubCategoryId?: string;
  newSubCategoryName?: string;
};

export type LocalExpenseSubCategoryMoveInput = LocalExpenseCategoryMoveInput & {
  oldSubCategoryId: string;
};

type ExpenseRow = {
  id: string;
  userId: string;
  type: string;
  categoryId: string;
  categoryName: string;
  subCategoryId: string | null;
  subCategoryName: string | null;
  amount: number;
  currency: string;
  date: Date;
  notes: string | null;
  link: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export async function listLocalExpenses(
  userId: string,
  options: LocalExpenseListOptions = {}
): Promise<Expense[]> {
  const rows = await prisma.expense.findMany({
    where: buildExpenseWhere(userId, options),
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    ...(options.limit ? { take: options.limit } : {}),
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  return rows.map(mapExpenseRow);
}

export async function listLocalExpensesForCostCenter(
  userId: string,
  costCenterId: string
): Promise<Expense[]> {
  const rows = await prisma.expense.findMany({
    where: { userId, costCenterId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  return rows.map(mapExpenseRow);
}

export async function createLocalExpense(
  userId: string,
  expenseData: LocalExpenseInput
): Promise<Expense> {
  const row = await prisma.expense.create({
    data: {
      userId,
      ...buildExpenseData(expenseData),
    },
  });

  return mapExpenseRow(row);
}

export async function updateLocalExpense(
  userId: string,
  expenseId: string,
  expenseData: LocalExpenseInput
): Promise<Expense | null> {
  try {
    const row = await prisma.expense.update({
      where: {
        id_userId: {
          id: expenseId,
          userId,
        },
      },
      data: buildExpenseData(expenseData),
    });

    return mapExpenseRow(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }

    throw error;
  }
}

export async function deleteLocalExpense(
  userId: string,
  expenseId: string
): Promise<boolean> {
  const result = await prisma.expense.deleteMany({
    where: {
      id: expenseId,
      userId,
    },
  });

  return result.count > 0;
}

export async function getLocalMonthlyExpenseSummary(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyExpenseSummary> {
  const expenses = await listLocalExpenses(userId, {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
    includeEndDate: false,
  });

  return summarizeMonthlyExpenses(year, month, expenses);
}

export async function countLocalExpensesByCategory(
  userId: string,
  categoryId: string
): Promise<number> {
  return prisma.expense.count({
    where: { userId, categoryId },
  });
}

export async function countLocalExpensesBySubCategory(
  userId: string,
  categoryId: string,
  subCategoryId: string
): Promise<number> {
  return prisma.expense.count({
    where: { userId, categoryId, subCategoryId },
  });
}

export async function reassignLocalExpensesCategory(
  userId: string,
  input: LocalExpenseCategoryReassignmentInput
): Promise<number> {
  const result = await prisma.expense.updateMany({
    where: { userId, categoryId: input.oldCategoryId },
    data: {
      categoryId: input.newCategoryId,
      categoryName: input.newCategoryName,
      subCategoryId: input.newSubCategoryId ?? null,
      subCategoryName: input.newSubCategoryName ?? null,
    },
  });

  return result.count;
}

export async function clearLocalExpensesCategoryAssignment(
  userId: string,
  categoryId: string
): Promise<number> {
  const result = await prisma.expense.updateMany({
    where: { userId, categoryId },
    data: {
      categoryId: "uncategorized",
      categoryName: "Uncategorized",
      subCategoryId: null,
      subCategoryName: null,
    },
  });

  return result.count;
}

export async function reassignLocalExpensesSubCategory(
  userId: string,
  input: LocalExpenseSubCategoryReassignmentInput
): Promise<number> {
  const result = await prisma.expense.updateMany({
    where: {
      userId,
      categoryId: input.categoryId,
      subCategoryId: input.oldSubCategoryId,
    },
    data: {
      subCategoryId: input.newSubCategoryId ?? null,
      subCategoryName: input.newSubCategoryName ?? null,
    },
  });

  return result.count;
}

export async function moveLocalExpensesToCategory(
  userId: string,
  input: LocalExpenseCategoryMoveInput
): Promise<number> {
  const result = await prisma.expense.updateMany({
    where: { userId, categoryId: input.oldCategoryId },
    data: buildCategoryMoveData(input),
  });

  return result.count;
}

export async function moveLocalExpensesFromSubCategory(
  userId: string,
  input: LocalExpenseSubCategoryMoveInput
): Promise<number> {
  const result = await prisma.expense.updateMany({
    where: {
      userId,
      categoryId: input.oldCategoryId,
      subCategoryId: input.oldSubCategoryId,
    },
    data: buildCategoryMoveData(input),
  });

  return result.count;
}

type LocalExpenseWriteData = {
  type: string;
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
  amount: number;
  currency: string;
  date: Date;
  notes?: string;
  link?: string;
  costCenterId?: string | null;
  costCenterName?: string | null;
  metadata: Prisma.InputJsonObject;
};

function buildExpenseData(expenseData: LocalExpenseInput): LocalExpenseWriteData {
  return {
    type: expenseData.type,
    categoryId: expenseData.categoryId,
    categoryName: expenseData.categoryName,
    subCategoryId: expenseData.subCategoryId,
    subCategoryName: expenseData.subCategoryName,
    amount: normalizeAmount(expenseData.type, expenseData.amount),
    currency: expenseData.currency,
    date: expenseData.date,
    notes: expenseData.notes,
    link: expenseData.link,
    costCenterId: expenseData.costCenterId,
    costCenterName: expenseData.costCenterName,
    metadata: buildExpenseMetadata(expenseData),
  };
}

function buildExpenseWhere(
  userId: string,
  options: LocalExpenseListOptions
): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = { userId };

  if (options.from || options.to) {
    where.date = {
      ...(options.from ? { gte: options.from } : {}),
      ...(options.to
        ? options.includeEndDate === false
          ? { lt: options.to }
          : { lte: options.to }
        : {}),
    };
  }

  if (options.type) {
    where.type = options.type;
  }

  return where;
}

function normalizeAmount(type: ExpenseType, amount: number): number {
  const absoluteAmount = Math.abs(amount);
  return type === "income" ? absoluteAmount : -absoluteAmount;
}

function buildCategoryMoveData(
  input: LocalExpenseCategoryMoveInput
): Prisma.ExpenseUpdateManyMutationInput {
  return {
    ...(needsSignFlip(input.oldType, input.newType) ? { amount: { multiply: -1 } } : {}),
    categoryId: input.newCategoryId,
    categoryName: input.newCategoryName,
    subCategoryId: input.newSubCategoryId ?? null,
    subCategoryName: input.newSubCategoryName ?? null,
    type: input.newType,
  };
}

function needsSignFlip(oldType: ExpenseType, newType: ExpenseType): boolean {
  return (oldType === "income") !== (newType === "income");
}

function summarizeMonthlyExpenses(
  year: number,
  month: number,
  expenses: Expense[]
): MonthlyExpenseSummary {
  const summary: MonthlyExpenseSummary = {
    year,
    month,
    totalIncome: 0,
    totalExpenses: 0,
    netBalance: 0,
    byCategory: {},
    byType: {
      fixed: { total: 0, count: 0 },
      variable: { total: 0, count: 0 },
      debt: { total: 0, count: 0 },
      income: { total: 0, count: 0 },
    },
  };

  for (const expense of expenses) {
    if (expense.type === "income") {
      summary.totalIncome += expense.amount;
    } else {
      summary.totalExpenses += Math.abs(expense.amount);
    }

    summary.byCategory[expense.categoryId] ??= {
      categoryName: expense.categoryName,
      total: 0,
      count: 0,
    };
    summary.byCategory[expense.categoryId].total += expense.amount;
    summary.byCategory[expense.categoryId].count += 1;

    summary.byType[expense.type].total += Math.abs(expense.amount);
    summary.byType[expense.type].count += 1;
  }

  summary.netBalance = summary.totalIncome - summary.totalExpenses;
  return summary;
}

function buildExpenseMetadata(expenseData: LocalExpenseInput): Prisma.InputJsonObject {
  return stripUndefined({
    isRecurring: expenseData.isRecurring,
    recurringDay: expenseData.recurringDay,
    recurringParentId: expenseData.recurringParentId,
    isInstallment: expenseData.isInstallment,
    installmentParentId: expenseData.installmentParentId,
    installmentNumber: expenseData.installmentNumber,
    installmentTotal: expenseData.installmentTotal,
    installmentTotalAmount: expenseData.installmentTotalAmount,
    linkedCashAssetId: expenseData.linkedCashAssetId,
    linkedInvestmentAssetId: expenseData.linkedInvestmentAssetId,
    linkedInvestmentAssetName: expenseData.linkedInvestmentAssetName,
    linkedInvestmentQuantityDelta: expenseData.linkedInvestmentQuantityDelta,
    investmentOperationId: expenseData.investmentOperationId,
    investmentOperationType: expenseData.investmentOperationType,
    investmentOperationPricePerUnit: expenseData.investmentOperationPricePerUnit,
    investmentOperationFees: expenseData.investmentOperationFees,
    investmentOperationTaxes: expenseData.investmentOperationTaxes,
    costCenterId: expenseData.costCenterId,
    costCenterName: expenseData.costCenterName,
    attributionProfileId: expenseData.attributionProfileId,
    attributionProfileName: expenseData.attributionProfileName,
    attributionSplits: expenseData.attributionSplits,
  });
}

function mapExpenseRow(row: ExpenseRow): Expense {
  const metadata = isRecord(row.metadata) ? row.metadata : {};

  return {
    id: row.id,
    userId: row.userId,
    type: row.type as ExpenseType,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    subCategoryId: row.subCategoryId ?? undefined,
    subCategoryName: row.subCategoryName ?? undefined,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    notes: row.notes ?? undefined,
    link: row.link ?? undefined,
    costCenterId: row.costCenterId ?? (metadata.costCenterId as string | undefined),
    costCenterName: row.costCenterName ?? (metadata.costCenterName as string | undefined),
    isRecurring: metadata.isRecurring as boolean | undefined,
    recurringDay: metadata.recurringDay as number | undefined,
    recurringParentId: metadata.recurringParentId as string | undefined,
    isInstallment: metadata.isInstallment as boolean | undefined,
    installmentParentId: metadata.installmentParentId as string | undefined,
    installmentNumber: metadata.installmentNumber as number | undefined,
    installmentTotal: metadata.installmentTotal as number | undefined,
    installmentTotalAmount: metadata.installmentTotalAmount as number | undefined,
    linkedCashAssetId: metadata.linkedCashAssetId as string | undefined,
    linkedInvestmentAssetId: metadata.linkedInvestmentAssetId as string | undefined,
    linkedInvestmentAssetName: metadata.linkedInvestmentAssetName as string | undefined,
    linkedInvestmentQuantityDelta: metadata.linkedInvestmentQuantityDelta as number | undefined,
    investmentOperationId: metadata.investmentOperationId as string | undefined,
    investmentOperationType: metadata.investmentOperationType as LinkedInvestmentOperationType | undefined,
    investmentOperationPricePerUnit: metadata.investmentOperationPricePerUnit as number | undefined,
    investmentOperationFees: metadata.investmentOperationFees as number | undefined,
    investmentOperationTaxes: metadata.investmentOperationTaxes as number | undefined,
    attributionProfileId: metadata.attributionProfileId as string | undefined,
    attributionProfileName: metadata.attributionProfileName as string | undefined,
    attributionSplits: metadata.attributionSplits as OwnershipSplit[] | undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function stripUndefined(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Prisma.InputJsonObject;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

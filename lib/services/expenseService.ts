/**
 * Expense Service
 *
 * Client-side wrapper around local authenticated expense APIs.
 */

import { authenticatedFetch } from '@/lib/utils/authFetch';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { appendHouseholdAuditEntrySafe } from '@/lib/services/householdService';
import {
  Expense,
  ExpenseFormData,
  ExpenseStats,
  MonthlyExpenseSummary,
  ExpenseType
} from '@/types/expenses';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

type DateInput = Date | string | { toDate: () => Date } | null | undefined;

function toDate(value: DateInput): Date {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && 'toDate' in value) {
    return value.toDate();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function mapExpense(input: Expense): Expense {
  return {
    ...input,
    date: toDate(input.date as DateInput),
    createdAt: toDate(input.createdAt as DateInput),
    updatedAt: toDate(input.updatedAt as DateInput),
  };
}

function mapExpenses(input: Expense[]): Expense[] {
  return input.map(mapExpense);
}

function normalizeAmount(type: ExpenseType, amount: number): number {
  const absoluteAmount = Math.abs(amount);
  return type === 'income' ? absoluteAmount : -absoluteAmount;
}

function generateSeriesParentId(prefix: 'recurring' | 'installment'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getRecurringExpenseDate(startDate: Date, monthOffset: number, recurringDay: number): Date {
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + monthOffset;
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(recurringDay, lastDayOfMonth);
  return new Date(year, month, day);
}

function buildExpenseByIdPath(expenseId: string): string {
  return `/api/expenses/${encodeURIComponent(expenseId)}`;
}

function buildExpensesPath(params: Record<string, string | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query.length > 0 ? `/api/expenses?${query}` : '/api/expenses';
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : fallbackMessage
    );
  }

  return payload as T;
}

async function postExpense(payload: Record<string, unknown>): Promise<Expense> {
  const response = await authenticatedFetch('/api/expenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const createdExpense = await parseJsonResponse<Expense>(response, 'Failed to create expense');
  return mapExpense(createdExpense);
}

function buildExpensePayload(
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Record<string, unknown> {
  return {
    ...expenseData,
    categoryName,
    subCategoryName,
  };
}

function buildUpdatePayload(
  expense: Expense,
  updates: Partial<ExpenseFormData>,
  categoryName?: string,
  subCategoryName?: string
): Record<string, unknown> {
  const nextType = updates.type ?? expense.type;
  const nextAmount = normalizeAmount(nextType, updates.amount ?? expense.amount);

  return {
    type: nextType,
    categoryId: updates.categoryId ?? expense.categoryId,
    categoryName: categoryName ?? expense.categoryName,
    subCategoryId: updates.subCategoryId ?? expense.subCategoryId,
    subCategoryName: subCategoryName ?? expense.subCategoryName,
    amount: nextAmount,
    currency: updates.currency ?? expense.currency,
    date: (updates.date ?? toDate(expense.date as DateInput)),
    notes: updates.notes ?? expense.notes,
    link: updates.link ?? expense.link,
    isRecurring: updates.isRecurring ?? expense.isRecurring,
    recurringDay: updates.recurringDay ?? expense.recurringDay,
    recurringParentId: expense.recurringParentId,
    isInstallment: updates.isInstallment ?? expense.isInstallment,
    installmentParentId: expense.installmentParentId,
    installmentNumber: expense.installmentNumber,
    installmentTotal: expense.installmentTotal,
    installmentTotalAmount: expense.installmentTotalAmount,
    linkedCashAssetId: updates.linkedCashAssetId ?? expense.linkedCashAssetId,
    linkedInvestmentAssetId: updates.linkedInvestmentAssetId ?? expense.linkedInvestmentAssetId,
    linkedInvestmentAssetName: updates.linkedInvestmentAssetName ?? expense.linkedInvestmentAssetName,
    linkedInvestmentQuantityDelta:
      updates.linkedInvestmentQuantityDelta ?? expense.linkedInvestmentQuantityDelta,
    investmentOperationId: updates.investmentOperationId ?? expense.investmentOperationId,
    investmentOperationType: updates.investmentOperationType ?? expense.investmentOperationType,
    investmentOperationPricePerUnit:
      updates.investmentOperationPricePerUnit ?? expense.investmentOperationPricePerUnit,
    investmentOperationFees: updates.investmentOperationFees ?? expense.investmentOperationFees,
    investmentOperationTaxes: updates.investmentOperationTaxes ?? expense.investmentOperationTaxes,
    costCenterId: updates.costCenterId ?? expense.costCenterId,
    costCenterName: updates.costCenterName ?? expense.costCenterName,
    attributionProfileId: updates.attributionProfileId ?? expense.attributionProfileId,
    attributionProfileName: updates.attributionProfileName ?? expense.attributionProfileName,
    attributionSplits: updates.attributionSplits ?? expense.attributionSplits,
  };
}

/**
 * Get all expenses for a specific user
 */
export async function getAllExpenses(userId: string): Promise<Expense[]> {
  try {
    const response = await authenticatedFetch('/api/expenses', {
      method: 'GET',
    });

    const expenses = await parseJsonResponse<Expense[]>(response, 'Failed to fetch expenses');
    return mapExpenses(expenses);
  } catch (error) {
    console.error('Error getting expenses:', { userId, error });
    throw new Error('Failed to fetch expenses');
  }
}

/**
 * Get expenses for a specific month
 */
export async function getExpensesByMonth(
  userId: string,
  year: number,
  month: number
): Promise<Expense[]> {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    return await getExpensesByDateRange(userId, startDate, endDate);
  } catch (error) {
    console.error('Error getting expenses by month:', { userId, year, month, error });
    throw new Error('Failed to fetch expenses by month');
  }
}

/**
 * Get expenses in a date range
 */
export async function getExpensesByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Expense[]> {
  try {
    const path = buildExpensesPath({
      from: startDate.toISOString(),
      to: endDate.toISOString(),
    });

    const response = await authenticatedFetch(path, {
      method: 'GET',
    });

    const expenses = await parseJsonResponse<Expense[]>(response, 'Failed to fetch expenses by date range');
    return mapExpenses(expenses);
  } catch (error) {
    console.error('Error getting expenses by date range:', { userId, startDate, endDate, error });
    throw new Error('Failed to fetch expenses by date range');
  }
}

/**
 * Get a single expense by ID
 */
export async function getExpenseById(expenseId: string): Promise<Expense | null> {
  try {
    const response = await authenticatedFetch(buildExpenseByIdPath(expenseId), {
      method: 'GET',
    });

    if (response.status === 404) {
      return null;
    }

    const expense = await parseJsonResponse<Expense>(response, 'Failed to fetch expense');
    return mapExpense(expense);
  } catch (error) {
    console.error('Error getting expense:', { expenseId, error });
    throw new Error('Failed to fetch expense');
  }
}

/**
 * Create a new expense (single, recurring, or installment)
 */
export async function createExpense(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string | string[]> {
  try {
    if (expenseData.isInstallment && expenseData.installmentCount && expenseData.installmentCount > 1) {
      return await createInstallmentExpenses(userId, expenseData, categoryName, subCategoryName);
    }

    if (expenseData.isRecurring && expenseData.recurringMonths && expenseData.recurringMonths > 0) {
      return await createRecurringExpenses(userId, expenseData, categoryName, subCategoryName);
    }

    const createdExpense = await postExpense(buildExpensePayload(expenseData, categoryName, subCategoryName));

    await invalidateDashboardOverviewSummary(userId, 'expense_created');
    appendHouseholdAuditEntrySafe(userId, {
      entityType: 'expense',
      entityId: createdExpense.id,
      action: 'create',
      summary: `Cashflow creato: ${categoryName}`,
      after: {
        categoryName,
        amount: normalizeAmount(expenseData.type, expenseData.amount),
        attributionProfileId: expenseData.attributionProfileId,
        attributionProfileName: expenseData.attributionProfileName,
      },
    });

    return createdExpense.id;
  } catch (error) {
    console.error('Error creating expense:', { userId, error });
    throw new Error('Failed to create expense');
  }
}

/**
 * Create recurring expenses (for debts)
 */
async function createRecurringExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string[]> {
  try {
    const createdIds: string[] = [];
    const recurringMonths = expenseData.recurringMonths || 1;
    const recurringDay = expenseData.recurringDay || expenseData.date.getDate();
    const parentId = generateSeriesParentId('recurring');

    for (let index = 0; index < recurringMonths; index++) {
      const expenseDate = getRecurringExpenseDate(expenseData.date, index, recurringDay);
      const payload = {
        ...buildExpensePayload(expenseData, categoryName, subCategoryName),
        amount: normalizeAmount(expenseData.type, expenseData.amount),
        date: expenseDate,
        isRecurring: true,
        recurringDay,
        recurringParentId: parentId,
        linkedCashAssetId: index === 0 ? expenseData.linkedCashAssetId : undefined,
        linkedInvestmentAssetId: index === 0 ? expenseData.linkedInvestmentAssetId : undefined,
        linkedInvestmentAssetName: index === 0 ? expenseData.linkedInvestmentAssetName : undefined,
        linkedInvestmentQuantityDelta: index === 0 ? expenseData.linkedInvestmentQuantityDelta : undefined,
        investmentOperationId: index === 0 ? expenseData.investmentOperationId : undefined,
        investmentOperationType: index === 0 ? expenseData.investmentOperationType : undefined,
        investmentOperationPricePerUnit: index === 0 ? expenseData.investmentOperationPricePerUnit : undefined,
        investmentOperationFees: index === 0 ? expenseData.investmentOperationFees : undefined,
        investmentOperationTaxes: index === 0 ? expenseData.investmentOperationTaxes : undefined,
      };

      const createdExpense = await postExpense(payload);
      createdIds.push(createdExpense.id);
    }

    await invalidateDashboardOverviewSummary(userId, 'expense_created');
    appendHouseholdAuditEntrySafe(userId, {
      entityType: 'expense',
      entityId: parentId,
      action: 'create',
      summary: `Cashflow ricorrente creato: ${categoryName}`,
      after: {
        categoryName,
        count: createdIds.length,
        attributionProfileId: expenseData.attributionProfileId,
        attributionProfileName: expenseData.attributionProfileName,
      },
    });

    return createdIds;
  } catch (error) {
    console.error('Error creating recurring expenses:', { userId, error });
    throw new Error('Failed to create recurring expenses');
  }
}

/**
 * Create installment expenses (for BNPL - Buy Now Pay Later)
 */
async function createInstallmentExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string[]> {
  try {
    const createdIds: string[] = [];
    const parentId = generateSeriesParentId('installment');

    const installmentCount = expenseData.installmentCount || 1;
    const startDate = expenseData.installmentStartDate || expenseData.date;

    let installmentAmounts: number[];
    let totalAmount: number;

    if (expenseData.installmentMode === 'auto') {
      totalAmount = expenseData.installmentTotalAmount || 0;
      const perInstallment = totalAmount / installmentCount;
      const baseAmount = Math.floor(perInstallment * 100) / 100;
      const remainder = totalAmount - (baseAmount * installmentCount);

      installmentAmounts = Array(installmentCount - 1).fill(baseAmount);
      installmentAmounts.push(baseAmount + remainder);
    } else {
      installmentAmounts = expenseData.installmentAmounts || [];
      totalAmount = installmentAmounts.reduce((sum, amount) => sum + amount, 0);
    }

    const isIncome = expenseData.type === 'income';
    installmentAmounts = installmentAmounts.map((amount) => normalizeAmount(expenseData.type, amount));
    totalAmount = isIncome ? Math.abs(totalAmount) : -Math.abs(totalAmount);

    for (let index = 0; index < installmentCount; index++) {
      const installmentDate = new Date(startDate);
      installmentDate.setMonth(installmentDate.getMonth() + index);

      const payload = {
        ...buildExpensePayload(expenseData, categoryName, subCategoryName),
        amount: installmentAmounts[index],
        date: installmentDate,
        notes: expenseData.notes
          ? `${expenseData.notes} (Installment ${index + 1}/${installmentCount})`
          : `Installment ${index + 1}/${installmentCount}`,
        isInstallment: true,
        installmentParentId: parentId,
        installmentNumber: index + 1,
        installmentTotal: installmentCount,
        installmentTotalAmount: totalAmount,
        linkedCashAssetId: index === 0 ? expenseData.linkedCashAssetId : undefined,
        linkedInvestmentAssetId: index === 0 ? expenseData.linkedInvestmentAssetId : undefined,
        linkedInvestmentAssetName: index === 0 ? expenseData.linkedInvestmentAssetName : undefined,
        linkedInvestmentQuantityDelta: index === 0 ? expenseData.linkedInvestmentQuantityDelta : undefined,
        investmentOperationId: index === 0 ? expenseData.investmentOperationId : undefined,
        investmentOperationType: index === 0 ? expenseData.investmentOperationType : undefined,
        investmentOperationPricePerUnit: index === 0 ? expenseData.investmentOperationPricePerUnit : undefined,
        investmentOperationFees: index === 0 ? expenseData.investmentOperationFees : undefined,
        investmentOperationTaxes: index === 0 ? expenseData.investmentOperationTaxes : undefined,
      };

      const createdExpense = await postExpense(payload);
      createdIds.push(createdExpense.id);
    }

    await invalidateDashboardOverviewSummary(userId, 'expense_created');
    appendHouseholdAuditEntrySafe(userId, {
      entityType: 'expense',
      entityId: parentId,
      action: 'create',
      summary: `Rate cashflow create: ${categoryName}`,
      after: {
        categoryName,
        count: createdIds.length,
        attributionProfileId: expenseData.attributionProfileId,
        attributionProfileName: expenseData.attributionProfileName,
      },
    });

    return createdIds;
  } catch (error) {
    console.error('Error creating installment expenses:', { userId, error });
    throw new Error('Failed to create installment expenses');
  }
}

/**
 * Delete all expenses in an installment series
 */
export async function deleteInstallmentExpenses(installmentParentId: string): Promise<void> {
  try {
    const response = await authenticatedFetch(
      buildExpensesPath({ installmentParentId }),
      { method: 'DELETE' }
    );

    await parseJsonResponse<{ deletedCount: number }>(response, 'Failed to delete installment expenses');
  } catch (error) {
    console.error('Error deleting installment expenses:', { installmentParentId, error });
    throw new Error('Failed to delete installment expenses');
  }
}

/**
 * Update an existing expense
 */
export async function updateExpense(
  expenseId: string,
  updates: Partial<ExpenseFormData>,
  categoryName?: string,
  subCategoryName?: string
): Promise<void> {
  try {
    const existingExpense = await getExpenseById(expenseId);

    if (!existingExpense) {
      throw new Error('Expense not found');
    }

    const response = await authenticatedFetch(buildExpenseByIdPath(expenseId), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildUpdatePayload(existingExpense, updates, categoryName, subCategoryName)
      ),
    });

    await parseJsonResponse<Expense>(response, 'Failed to update expense');

    await invalidateDashboardOverviewSummary(existingExpense.userId, 'expense_updated');
    appendHouseholdAuditEntrySafe(existingExpense.userId, {
      entityType: 'expense',
      entityId: expenseId,
      action: 'update',
      summary: `Cashflow aggiornato: ${categoryName ?? existingExpense.categoryName ?? expenseId}`,
      before: {
        attributionProfileId: existingExpense.attributionProfileId,
        attributionProfileName: existingExpense.attributionProfileName,
      },
      after: {
        attributionProfileId: updates.attributionProfileId,
        attributionProfileName: updates.attributionProfileName,
      },
    });
  } catch (error) {
    console.error('Error updating expense:', { expenseId, error });
    throw new Error('Failed to update expense');
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  try {
    const existingExpense = await getExpenseById(expenseId);

    const response = await authenticatedFetch(buildExpenseByIdPath(expenseId), {
      method: 'DELETE',
    });

    await parseJsonResponse<{ success: boolean }>(response, 'Failed to delete expense');

    if (existingExpense) {
      await invalidateDashboardOverviewSummary(existingExpense.userId, 'expense_deleted');
      appendHouseholdAuditEntrySafe(existingExpense.userId, {
        entityType: 'expense',
        entityId: expenseId,
        action: 'delete',
        summary: `Cashflow eliminato: ${existingExpense.categoryName ?? expenseId}`,
        before: {
          categoryName: existingExpense.categoryName,
          amount: existingExpense.amount,
          attributionProfileId: existingExpense.attributionProfileId,
          attributionProfileName: existingExpense.attributionProfileName,
        },
      });
    }
  } catch (error) {
    console.error('Error deleting expense:', { expenseId, error });
    throw new Error('Failed to delete expense');
  }
}

/**
 * Delete all recurring expenses with the same parent ID
 */
export async function deleteRecurringExpenses(recurringParentId: string): Promise<void> {
  try {
    const response = await authenticatedFetch(
      buildExpensesPath({ recurringParentId }),
      { method: 'DELETE' }
    );

    await parseJsonResponse<{ deletedCount: number }>(response, 'Failed to delete recurring expenses');
  } catch (error) {
    console.error('Error deleting recurring expenses:', { recurringParentId, error });
    throw new Error('Failed to delete recurring expenses');
  }
}

/**
 * Calculate monthly summary for a specific month
 */
export async function getMonthlyExpenseSummary(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyExpenseSummary> {
  try {
    const response = await authenticatedFetch(`/api/expenses/summary?year=${year}&month=${month}`, {
      method: 'GET',
    });

    return await parseJsonResponse<MonthlyExpenseSummary>(
      response,
      'Failed to calculate monthly expense summary'
    );
  } catch (error) {
    console.error('Error calculating monthly expense summary:', { userId, year, month, error });
    throw new Error('Failed to calculate monthly expense summary');
  }
}

/**
 * Get expense statistics with delta from previous month
 */
export async function getExpenseStats(userId: string): Promise<ExpenseStats> {
  try {
    const { month: currentMonth, year: currentYear } = getItalyMonthYear();

    let previousYear = currentYear;
    let previousMonth = currentMonth - 1;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear -= 1;
    }

    const [currentSummary, previousSummary] = await Promise.all([
      getMonthlyExpenseSummary(userId, currentYear, currentMonth),
      getMonthlyExpenseSummary(userId, previousYear, previousMonth),
    ]);

    const incomeDelta = previousSummary.totalIncome > 0
      ? ((currentSummary.totalIncome - previousSummary.totalIncome) / previousSummary.totalIncome) * 100
      : 0;

    const expensesDelta = previousSummary.totalExpenses > 0
      ? ((currentSummary.totalExpenses - previousSummary.totalExpenses) / previousSummary.totalExpenses) * 100
      : 0;

    const netDelta = previousSummary.netBalance !== 0
      ? ((currentSummary.netBalance - previousSummary.netBalance) / Math.abs(previousSummary.netBalance)) * 100
      : 0;

    return {
      currentMonth: {
        income: currentSummary.totalIncome,
        expenses: currentSummary.totalExpenses,
        net: currentSummary.netBalance,
      },
      previousMonth: {
        income: previousSummary.totalIncome,
        expenses: previousSummary.totalExpenses,
        net: previousSummary.netBalance,
      },
      delta: {
        income: incomeDelta,
        expenses: expensesDelta,
        net: netDelta,
      },
    };
  } catch (error) {
    console.error('Error getting expense stats:', { userId, error });
    throw new Error('Failed to get expense stats');
  }
}

/**
 * Calculate total income for a period
 */
export function calculateTotalIncome(expenses: Expense[]): number {
  return expenses
    .filter(expense => expense.type === 'income')
    .reduce((total, expense) => total + expense.amount, 0);
}

/**
 * Calculate total expenses for a period
 */
export function calculateTotalExpenses(expenses: Expense[]): number {
  return expenses
    .filter(expense => expense.type !== 'income')
    .reduce((total, expense) => total + Math.abs(expense.amount), 0);
}

/**
 * Calculate net balance (income - expenses)
 */
export function calculateNetBalance(expenses: Expense[]): number {
  return calculateTotalIncome(expenses) - calculateTotalExpenses(expenses);
}

/**
 * Calculate income to expense ratio
 */
export function calculateIncomeExpenseRatio(expenses: Expense[]): number | null {
  const totalIncome = calculateTotalIncome(expenses);
  const totalExpenses = calculateTotalExpenses(expenses);

  if (totalExpenses === 0) {
    return null;
  }

  return totalIncome / totalExpenses;
}

async function postExpenseCategoryAssignmentAction(
  body: Record<string, unknown>,
  fallbackMessage: string
): Promise<number> {
  const response = await authenticatedFetch('/api/expenses/category-assignment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = await parseJsonResponse<{ count?: number }>(response, fallbackMessage);
  return payload.count ?? 0;
}

/**
 * Count expenses associated with a category
 */
export async function getExpenseCountByCategoryId(
  categoryId: string,
  _userId: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      { action: 'countByCategory', categoryId },
      'Failed to count expenses by category'
    );
  } catch (error) {
    console.error('Error counting expenses by category:', error);
    throw new Error('Failed to count expenses by category');
  }
}

/**
 * Count expenses associated with a subcategory
 */
export async function getExpenseCountBySubCategoryId(
  categoryId: string,
  subCategoryId: string,
  _userId: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      { action: 'countBySubCategory', categoryId, subCategoryId },
      'Failed to count expenses by subcategory'
    );
  } catch (error) {
    console.error('Error counting expenses by subcategory:', error);
    throw new Error('Failed to count expenses by subcategory');
  }
}

/**
 * Update all expenses when a category name changes
 */
export async function updateExpensesCategoryName(
  categoryId: string,
  newCategoryName: string,
  userId: string
): Promise<void> {
  try {
    await postExpenseCategoryAssignmentAction(
      { action: 'updateCategoryName', categoryId, newCategoryName },
      'Failed to update expenses category name'
    );
  } catch (error) {
    console.error('Error updating expenses category name:', { categoryId, userId, error });
    throw new Error('Failed to update expenses category name');
  }
}

/**
 * Update all expenses when a subcategory name changes
 */
export async function updateExpensesSubCategoryName(
  categoryId: string,
  subCategoryId: string,
  newSubCategoryName: string,
  userId: string
): Promise<void> {
  try {
    await postExpenseCategoryAssignmentAction(
      {
        action: 'updateSubCategoryName',
        categoryId,
        subCategoryId,
        newSubCategoryName,
      },
      'Failed to update expenses subcategory name'
    );
  } catch (error) {
    console.error('Error updating expenses subcategory name:', { categoryId, subCategoryId, userId, error });
    throw new Error('Failed to update expenses subcategory name');
  }
}

/**
 * Reassign all expenses from one category to another
 */
export async function reassignExpensesCategory(
  oldCategoryId: string,
  newCategoryId: string,
  newCategoryName: string,
  _userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      {
        action: 'reassignCategory',
        oldCategoryId,
        newCategoryId,
        newCategoryName,
        newSubCategoryId,
        newSubCategoryName,
      },
      'Failed to reassign expenses category'
    );
  } catch (error) {
    console.error('Error reassigning expenses category:', error);
    throw new Error('Failed to reassign expenses category');
  }
}

/**
 * Clear category assignment from expenses when category is deleted without reassignment
 */
export async function clearExpensesCategoryAssignment(
  categoryId: string,
  _userId: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      { action: 'clearCategory', categoryId },
      'Failed to clear expenses category assignment'
    );
  } catch (error) {
    console.error('Error clearing expenses category assignment:', error);
    throw new Error('Failed to clear expenses category assignment');
  }
}

/**
 * Reassign all expenses from one subcategory to another (or to no subcategory)
 */
export async function reassignExpensesSubCategory(
  categoryId: string,
  oldSubCategoryId: string,
  _userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      {
        action: 'reassignSubCategory',
        categoryId,
        oldSubCategoryId,
        newSubCategoryId,
        newSubCategoryName,
      },
      'Failed to reassign expenses subcategory'
    );
  } catch (error) {
    console.error('Error reassigning expenses subcategory:', error);
    throw new Error('Failed to reassign expenses subcategory');
  }
}

/**
 * Move all expenses from one category to another, updating type for cross-type moves.
 */
export async function moveExpensesToCategory(
  oldCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  _userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      {
        action: 'moveCategory',
        oldCategoryId,
        oldType,
        newCategoryId,
        newCategoryName,
        newType,
        newSubCategoryId,
        newSubCategoryName,
      },
      'Failed to move expenses to category'
    );
  } catch (error) {
    console.error('Error moving expenses to category:', error);
    throw new Error('Failed to move expenses to category');
  }
}

/**
 * Move all expenses from a specific subcategory to another category/subcategory.
 */
export async function moveExpensesFromSubCategory(
  oldCategoryId: string,
  oldSubCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  _userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      {
        action: 'moveSubCategory',
        oldCategoryId,
        oldSubCategoryId,
        oldType,
        newCategoryId,
        newCategoryName,
        newType,
        newSubCategoryId,
        newSubCategoryName,
      },
      'Failed to move expenses from subcategory'
    );
  } catch (error) {
    console.error('Error moving expenses from subcategory:', error);
    throw new Error('Failed to move expenses from subcategory');
  }
}

/**
 * Batch-update the type of all expenses in a category when the category type changes.
 */
export async function updateExpensesType(
  categoryId: string,
  oldType: ExpenseType,
  newType: ExpenseType,
  userId: string
): Promise<number> {
  try {
    return await postExpenseCategoryAssignmentAction(
      {
        action: 'updateCategoryType',
        categoryId,
        oldType,
        newType,
      },
      'Failed to update expense types'
    );
  } catch (error) {
    console.error('Error updating expense types in category:', { categoryId, oldType, newType, userId, error });
    throw new Error('Failed to update expense types');
  }
}

/**
 * Fetch all expenses in a recurring series by parent ID.
 */
export async function getExpensesByRecurringParentId(recurringParentId: string): Promise<Expense[]> {
  try {
    const response = await authenticatedFetch(
      buildExpensesPath({ recurringParentId }),
      { method: 'GET' }
    );

    const expenses = await parseJsonResponse<Expense[]>(response, 'Failed to fetch recurring series expenses');
    return mapExpenses(expenses);
  } catch (error) {
    console.error('Error fetching recurring series expenses:', { recurringParentId, error });
    throw new Error('Failed to fetch recurring series expenses');
  }
}

/**
 * Fetch all expenses in an installment series by parent ID.
 */
export async function getExpensesByInstallmentParentId(installmentParentId: string): Promise<Expense[]> {
  try {
    const response = await authenticatedFetch(
      buildExpensesPath({ installmentParentId }),
      { method: 'GET' }
    );

    const expenses = await parseJsonResponse<Expense[]>(response, 'Failed to fetch installment series expenses');
    return mapExpenses(expenses);
  } catch (error) {
    console.error('Error fetching installment series expenses:', { installmentParentId, error });
    throw new Error('Failed to fetch installment series expenses');
  }
}

import 'server-only';

import { Dividend } from '@/types/dividend';
import { getDividendById, updateDividend } from '@/lib/services/dividendService';
import {
  createLocalExpense,
  deleteLocalExpense,
  getLocalExpenseById,
  updateLocalExpense,
} from '@/lib/server/cashflow/localExpenseService';
import { toDate } from '@/lib/utils/dateHelpers';

function buildExpenseAmountAndCurrency(dividend: Dividend): { amount: number; currency: string; useEurAmount: boolean } {
  const useEurAmount = dividend.currency.toUpperCase() !== 'EUR' && dividend.netAmountEur !== undefined;
  return {
    amount: useEurAmount ? dividend.netAmountEur! : dividend.netAmount,
    currency: useEurAmount ? 'EUR' : dividend.currency,
    useEurAmount,
  };
}

function buildDividendExpenseNotes(dividend: Dividend, useEurAmount: boolean): string {
  return `Dividendo ${dividend.assetTicker} - ${dividend.assetName}${
    useEurAmount ? ` (${dividend.netAmount.toFixed(2)} ${dividend.currency} convertiti)` : ''
  }${dividend.notes ? ` | ${dividend.notes}` : ''}`;
}

/**
 * Create an expense entry from a dividend
 * Returns the created expense ID
 * Uses EUR-converted amount if available, otherwise uses original currency
 */
export async function createExpenseFromDividend(
  dividend: Dividend,
  categoryId: string,
  categoryName: string,
  subCategoryId?: string,
  subCategoryName?: string
): Promise<string> {
  try {
    const paymentDate = toDate(dividend.paymentDate);

    const { amount, currency, useEurAmount } = buildExpenseAmountAndCurrency(dividend);

    const createdExpense = await createLocalExpense(dividend.userId, {
      type: 'income',
      categoryId,
      categoryName,
      subCategoryId,
      subCategoryName,
      amount,
      currency,
      date: paymentDate,
      notes: buildDividendExpenseNotes(dividend, useEurAmount),
      linkedInvestmentAssetId: dividend.assetId,
      linkedInvestmentAssetName: dividend.assetName,
    });

    // Update dividend with expense reference
    await updateDividend(dividend.id, {
      expenseId: createdExpense.id,
    } as any);

    console.log(`[dividendIncomeService] Created expense in ${currency} (amount: ${amount.toFixed(2)})`);
    return createdExpense.id;
  } catch (error) {
    console.error('Error creating expense from dividend:', error);
    throw new Error('Failed to create expense from dividend');
  }
}

/**
 * Update an existing expense entry from a dividend
 * Uses EUR-converted amount if available, otherwise uses original currency
 */
export async function updateExpenseFromDividend(
  dividend: Dividend,
  expenseId: string,
  categoryName: string,
  subCategoryName?: string
): Promise<void> {
  try {
    const paymentDate = toDate(dividend.paymentDate);

    const existingExpense = await getLocalExpenseById(dividend.userId, expenseId);
    if (!existingExpense) {
      throw new Error(`Expense not found: ${expenseId}`);
    }

    const { amount, currency, useEurAmount } = buildExpenseAmountAndCurrency(dividend);
    const updatedExpense = await updateLocalExpense(dividend.userId, expenseId, {
      type: existingExpense.type,
      categoryId: existingExpense.categoryId,
      categoryName,
      subCategoryId: existingExpense.subCategoryId,
      subCategoryName,
      amount,
      currency,
      date: paymentDate,
      notes: buildDividendExpenseNotes(dividend, useEurAmount),
      linkedInvestmentAssetId: dividend.assetId,
      linkedInvestmentAssetName: dividend.assetName,
      // Preserve existing optional fields because local update is a full replacement write.
      link: existingExpense.link,
      isRecurring: existingExpense.isRecurring,
      recurringDay: existingExpense.recurringDay,
      recurringParentId: existingExpense.recurringParentId,
      isInstallment: existingExpense.isInstallment,
      installmentParentId: existingExpense.installmentParentId,
      installmentNumber: existingExpense.installmentNumber,
      installmentTotal: existingExpense.installmentTotal,
      installmentTotalAmount: existingExpense.installmentTotalAmount,
      linkedCashAssetId: existingExpense.linkedCashAssetId,
      linkedInvestmentQuantityDelta: existingExpense.linkedInvestmentQuantityDelta,
      investmentOperationId: existingExpense.investmentOperationId,
      investmentOperationType: existingExpense.investmentOperationType,
      investmentOperationPricePerUnit: existingExpense.investmentOperationPricePerUnit,
      investmentOperationFees: existingExpense.investmentOperationFees,
      investmentOperationTaxes: existingExpense.investmentOperationTaxes,
      costCenterId: existingExpense.costCenterId,
      costCenterName: existingExpense.costCenterName,
      attributionProfileId: existingExpense.attributionProfileId,
      attributionProfileName: existingExpense.attributionProfileName,
      attributionSplits: existingExpense.attributionSplits,
    });

    if (!updatedExpense) {
      throw new Error(`Expense not found during update: ${expenseId}`);
    }

    console.log(`[dividendIncomeService] Updated expense in ${currency} (amount: ${amount.toFixed(2)})`);
  } catch (error) {
    console.error('Error updating expense from dividend:', error);
    throw new Error('Failed to update expense from dividend');
  }
}

/**
 * Delete expense entry associated with a dividend
 * Also removes expense reference from dividend
 */
export async function deleteExpenseForDividend(
  dividendId: string,
  expenseId: string
): Promise<void> {
  try {
    const dividend = await getDividendById(dividendId);
    if (!dividend) {
      throw new Error(`Dividend not found: ${dividendId}`);
    }

    await deleteLocalExpense(dividend.userId, expenseId);

    // Remove expense reference from dividend
    await updateDividend(dividendId, {
      expenseId: undefined,
    } as any);
  } catch (error) {
    console.error('Error deleting expense for dividend:', error);
    throw new Error('Failed to delete expense for dividend');
  }
}

/**
 * Sync all dividends to expense entries
 * Creates expenses for dividends without expense references
 * Useful for bulk synchronization
 */
export async function syncDividendExpenses(
  userId: string,
  dividends: Dividend[],
  categoryId: string,
  categoryName: string,
  subCategoryId?: string,
  subCategoryName?: string
): Promise<{ created: number; skipped: number; failed: number }> {
  const results = {
    created: 0,
    skipped: 0,
    failed: 0,
  };

  // Only create expenses for dividends already paid
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const dividend of dividends) {
    try {
      // Skip if expense already exists
      if (dividend.expenseId) {
        results.skipped++;
        continue;
      }

      // Skip if payment date is in the future
      const paymentDate = toDate(dividend.paymentDate);
      if (paymentDate > today) {
        results.skipped++;
        continue;
      }

      // Create expense for this dividend
      await createExpenseFromDividend(
        dividend,
        categoryId,
        categoryName,
        subCategoryId,
        subCategoryName
      );

      results.created++;
    } catch (error) {
      console.error(`Error syncing dividend ${dividend.id}:`, error);
      results.failed++;
    }
  }

  console.log('Dividend expense sync completed:', results);
  return results;
}

/**
 * Remove expense associations from dividends
 * Deletes expense entries and clears expenseId references
 * Useful for bulk de-synchronization
 */
export async function unsyncDividendExpenses(
  dividends: Dividend[]
): Promise<{ deleted: number; skipped: number; failed: number }> {
  const results = {
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const dividend of dividends) {
    try {
      // Skip if no expense association
      if (!dividend.expenseId) {
        results.skipped++;
        continue;
      }

      // Delete expense and clear reference
      await deleteExpenseForDividend(dividend.id, dividend.expenseId);

      results.deleted++;
    } catch (error) {
      console.error(`Error unsyncing dividend ${dividend.id}:`, error);
      results.failed++;
    }
  }

  console.log('Dividend expense unsync completed:', results);
  return results;
}

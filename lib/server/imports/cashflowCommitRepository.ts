import 'server-only';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { toDate } from '@/lib/utils/dateHelpers';
import type {
  CsvImportCashflowBatch,
  CsvImportCashflowBatchRepository,
  CsvImportCashflowCreatedRecord,
  CsvImportCashflowAssetRecord,
  CsvImportCashflowExpenseRecord,
  CsvImportCashflowDividendRecord,
  CsvImportCashflowInternalTransferRecord,
  CsvImportCashflowInvestmentOperationRecord,
} from '@/lib/server/imports/cashflowCommitTypes';

const BATCH_COLLECTION = 'csvImportBatches';
const ASSET_COLLECTION = 'assets';
const EXPENSE_COLLECTION = 'expenses';
const INTERNAL_TRANSFER_COLLECTION = 'internalTransfers';
const INVESTMENT_OPERATION_COLLECTION = 'investmentOperations';
const DIVIDEND_COLLECTION = 'dividends';

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
}

function normalizeExactText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mapBatch(id: string, data: Record<string, unknown>): CsvImportCashflowBatch {
  return {
    id,
    userId: String(data.userId ?? ''),
    idempotencyKey: String(data.idempotencyKey ?? ''),
    presetId: typeof data.presetId === 'string' ? data.presetId : null,
    sourceFingerprint: typeof data.sourceFingerprint === 'string' ? data.sourceFingerprint : null,
    requestFingerprint: String(data.requestFingerprint ?? ''),
    status: data.status === 'rolledBack' ? 'rolledBack' : 'committed',
    rowCount: Number(data.rowCount ?? 0),
    createdRecordCount: Number(data.createdRecordCount ?? 0),
    duplicateCount: Number(data.duplicateCount ?? 0),
    errorCount: Number(data.errorCount ?? 0),
    createdRecords: Array.isArray(data.createdRecords)
      ? (data.createdRecords as CsvImportCashflowCreatedRecord[])
      : [],
    createdAt: toDate(data.createdAt as never),
    committedAt: toDate(data.committedAt as never),
    rolledBackAt: data.rolledBackAt ? toDate(data.rolledBackAt as never) : null,
    rollbackReason: typeof data.rollbackReason === 'string' ? data.rollbackReason : null,
  };
}

function mapExpense(id: string, data: Record<string, unknown>): CsvImportCashflowExpenseRecord {
  return {
    id,
    userId: String(data.userId ?? ''),
    batchId: String(data.batchId ?? data.importBatchId ?? ''),
    rowIndex: Number(data.importRowIndex ?? data.rowIndex ?? 0),
    dedupeKey: String(data.importDedupeKey ?? data.dedupeKey ?? ''),
    type: (data.type as CsvImportCashflowExpenseRecord['type']) ?? 'variable',
    categoryId: String(data.categoryId ?? ''),
    categoryName: String(data.categoryName ?? ''),
    subCategoryId: typeof data.subCategoryId === 'string' ? data.subCategoryId : null,
    subCategoryName: typeof data.subCategoryName === 'string' ? data.subCategoryName : null,
    amount: Number(data.amount ?? 0),
    currency: String(data.currency ?? 'EUR'),
    date: toDate(data.date as never),
    notes: String(data.notes ?? ''),
    importBatchId: String(data.importBatchId ?? data.batchId ?? ''),
    importIdempotencyKey: String(data.importIdempotencyKey ?? ''),
    importSourceFingerprint: typeof data.importSourceFingerprint === 'string'
      ? data.importSourceFingerprint
      : null,
    importPresetId: typeof data.importPresetId === 'string' ? data.importPresetId : null,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
  };
}

function mapAsset(id: string, data: Record<string, unknown>): CsvImportCashflowAssetRecord {
  return {
    id,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    ticker: typeof data.ticker === 'string' ? data.ticker : undefined,
    isin: typeof data.isin === 'string' ? data.isin : undefined,
    assetClass: (data.assetClass as CsvImportCashflowAssetRecord['assetClass']) ?? 'cash',
    currency: String(data.currency ?? 'EUR'),
    quantity: Number(data.quantity ?? 0),
    averageCost: typeof data.averageCost === 'number' ? data.averageCost : undefined,
    updatedAt: toDate(data.updatedAt as never),
  };
}

function mapInvestmentOperation(
  id: string,
  data: Record<string, unknown>
): CsvImportCashflowInvestmentOperationRecord {
  return {
    id,
    userId: String(data.userId ?? ''),
    batchId: String(data.batchId ?? data.importBatchId ?? ''),
    rowIndex: Number(data.importRowIndex ?? data.rowIndex ?? 0),
    dedupeKey: String(data.importDedupeKey ?? data.dedupeKey ?? ''),
    assetId: String(data.assetId ?? ''),
    assetName: String(data.assetName ?? ''),
    assetTicker: String(data.assetTicker ?? ''),
    type: (data.type as CsvImportCashflowInvestmentOperationRecord['type']) ?? 'buy',
    date: toDate(data.date as never),
    quantity: Number(data.quantity ?? 0),
    pricePerUnit: Number(data.pricePerUnit ?? 0),
    grossAmount: Number(data.grossAmount ?? 0),
    fees: Number(data.fees ?? 0),
    taxes: Number(data.taxes ?? 0),
    currency: String(data.currency ?? 'EUR'),
    cashAssetId: typeof data.cashAssetId === 'string' ? data.cashAssetId : null,
    cashAssetName: typeof data.cashAssetName === 'string' ? data.cashAssetName : null,
    previousQuantity: Number(data.previousQuantity ?? 0),
    previousAverageCost: typeof data.previousAverageCost === 'number' ? data.previousAverageCost : undefined,
    resultingQuantity: Number(data.resultingQuantity ?? 0),
    resultingAverageCost: typeof data.resultingAverageCost === 'number' ? data.resultingAverageCost : undefined,
    realizedGain: typeof data.realizedGain === 'number' ? data.realizedGain : undefined,
    realizedGainTax: typeof data.realizedGainTax === 'number' ? data.realizedGainTax : undefined,
    netCashEffect: Number(data.netCashEffect ?? 0),
    notes: String(data.notes ?? ''),
    importBatchId: String(data.importBatchId ?? data.batchId ?? ''),
    importRowIndex: typeof data.importRowIndex === 'number' ? data.importRowIndex : undefined,
    importDedupeKey: typeof data.importDedupeKey === 'string' ? data.importDedupeKey : undefined,
    importIdempotencyKey: String(data.importIdempotencyKey ?? ''),
    importSourceFingerprint: typeof data.importSourceFingerprint === 'string'
      ? data.importSourceFingerprint
      : null,
    importPresetId: typeof data.importPresetId === 'string' ? data.importPresetId : null,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
  };
}

function mapDividend(id: string, data: Record<string, unknown>): CsvImportCashflowDividendRecord {
  return {
    id,
    userId: String(data.userId ?? ''),
    batchId: String(data.batchId ?? data.importBatchId ?? ''),
    rowIndex: Number(data.importRowIndex ?? data.rowIndex ?? 0),
    dedupeKey: String(data.importDedupeKey ?? data.dedupeKey ?? ''),
    assetId: String(data.assetId ?? ''),
    assetName: String(data.assetName ?? ''),
    assetTicker: String(data.assetTicker ?? ''),
    assetIsin: typeof data.assetIsin === 'string' ? data.assetIsin : null,
    exDate: toDate(data.exDate as never),
    paymentDate: toDate(data.paymentDate as never),
    dividendPerShare: Number(data.dividendPerShare ?? 0),
    quantity: Number(data.quantity ?? 0),
    grossAmount: Number(data.grossAmount ?? 0),
    taxAmount: Number(data.taxAmount ?? 0),
    netAmount: Number(data.netAmount ?? 0),
    currency: String(data.currency ?? 'EUR'),
    dividendType: (data.dividendType as CsvImportCashflowDividendRecord['dividendType']) ?? 'ordinary',
    notes: String(data.notes ?? ''),
    isAutoGenerated: Boolean(data.isAutoGenerated),
    expenseId: typeof data.expenseId === 'string' ? data.expenseId : undefined,
    grossAmountEur: typeof data.grossAmountEur === 'number' ? data.grossAmountEur : undefined,
    taxAmountEur: typeof data.taxAmountEur === 'number' ? data.taxAmountEur : undefined,
    netAmountEur: typeof data.netAmountEur === 'number' ? data.netAmountEur : undefined,
    exchangeRate: typeof data.exchangeRate === 'number' ? data.exchangeRate : undefined,
    costPerShare: typeof data.costPerShare === 'number' ? data.costPerShare : undefined,
    linkedMovementReference: typeof data.linkedMovementReference === 'string' ? data.linkedMovementReference : null,
    importBatchId: String(data.importBatchId ?? data.batchId ?? ''),
    importRowIndex: typeof data.importRowIndex === 'number' ? data.importRowIndex : undefined,
    importDedupeKey: typeof data.importDedupeKey === 'string' ? data.importDedupeKey : undefined,
    importIdempotencyKey: String(data.importIdempotencyKey ?? ''),
    importSourceFingerprint: typeof data.importSourceFingerprint === 'string'
      ? data.importSourceFingerprint
      : null,
    importPresetId: typeof data.importPresetId === 'string' ? data.importPresetId : null,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
  };
}

function mapInternalTransfer(id: string, data: Record<string, unknown>): CsvImportCashflowInternalTransferRecord {
  return {
    id,
    userId: String(data.userId ?? ''),
    batchId: String(data.batchId ?? data.importBatchId ?? ''),
    rowIndex: Number(data.importRowIndex ?? data.rowIndex ?? 0),
    dedupeKey: String(data.importDedupeKey ?? data.dedupeKey ?? ''),
    fromCashAssetId: String(data.fromCashAssetId ?? ''),
    fromCashAssetName: String(data.fromCashAssetName ?? ''),
    toCashAssetId: String(data.toCashAssetId ?? ''),
    toCashAssetName: String(data.toCashAssetName ?? ''),
    amount: Number(data.amount ?? 0),
    currency: String(data.currency ?? 'EUR'),
    date: toDate(data.date as never),
    fees: Number(data.fees ?? 0),
    purpose: (data.purpose as CsvImportCashflowInternalTransferRecord['purpose']) ?? 'neutral_transfer',
    notes: String(data.notes ?? ''),
    importBatchId: String(data.importBatchId ?? data.batchId ?? ''),
    importIdempotencyKey: String(data.importIdempotencyKey ?? ''),
    importSourceFingerprint: typeof data.importSourceFingerprint === 'string'
      ? data.importSourceFingerprint
      : null,
    importPresetId: typeof data.importPresetId === 'string' ? data.importPresetId : null,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
  };
}

export function createFirestoreCsvImportCashflowBatchRepository(): CsvImportCashflowBatchRepository {
  return {
    async getById(batchId) {
      const snapshot = await adminDb.collection(BATCH_COLLECTION).doc(batchId).get();
      if (!snapshot.exists) {
        return null;
      }

      return mapBatch(snapshot.id, snapshot.data() as Record<string, unknown>);
    },

    async getByUserAndIdempotencyKey(userId, idempotencyKey) {
      const snapshot = await adminDb
        .collection(BATCH_COLLECTION)
        .where('userId', '==', userId)
        .get();

      const docSnapshot = snapshot.docs.find((doc) => doc.data().idempotencyKey === idempotencyKey);
      if (!docSnapshot) {
        return null;
      }

      return mapBatch(docSnapshot.id, docSnapshot.data() as Record<string, unknown>);
    },

    async listByUserId(userId) {
      const snapshot = await adminDb
        .collection(BATCH_COLLECTION)
        .where('userId', '==', userId)
        .get();

      return snapshot.docs
        .map((doc) => mapBatch(doc.id, doc.data() as Record<string, unknown>))
        .sort((left, right) => (
          right.committedAt.getTime() - left.committedAt.getTime()
          || right.createdAt.getTime() - left.createdAt.getTime()
        ));
    },

    async listCommittedByUserId(userId) {
      const snapshot = await adminDb
        .collection(BATCH_COLLECTION)
        .where('userId', '==', userId)
        .get();

      return snapshot.docs
        .map((doc) => mapBatch(doc.id, doc.data() as Record<string, unknown>))
        .filter((batch) => batch.status === 'committed');
    },

    async getCashAssetById(assetId) {
      const snapshot = await adminDb.collection(ASSET_COLLECTION).doc(assetId).get();
      if (!snapshot.exists) {
        return null;
      }

      return mapAsset(snapshot.id, snapshot.data() as Record<string, unknown>);
    },

    async getAssetById(assetId) {
      const snapshot = await adminDb.collection(ASSET_COLLECTION).doc(assetId).get();
      if (!snapshot.exists) {
        return null;
      }

      return mapAsset(snapshot.id, snapshot.data() as Record<string, unknown>);
    },

    async getInvestmentAssetByConfirmedReference(userId, reference) {
      const snapshot = await adminDb
        .collection(ASSET_COLLECTION)
        .where('userId', '==', userId)
        .get();

      const targetTicker = normalizeExactText(reference.assetTicker);
      const targetIsin = normalizeExactText(reference.assetIsin);
      const targetName = normalizeExactText(reference.assetName);

      const matchingAsset = snapshot.docs
        .map((doc) => mapAsset(doc.id, doc.data() as Record<string, unknown>))
        .find((asset) => {
          if (asset.assetClass === 'cash') {
            return false;
          }

          const tickerMatches = !targetTicker || normalizeExactText(asset.ticker) === targetTicker;
          const isinMatches = !targetIsin || normalizeExactText(asset.isin) === targetIsin;
          const nameMatches = !targetName || normalizeExactText(asset.name) === targetName;

          return tickerMatches && isinMatches && nameMatches;
        });

      return matchingAsset ?? null;
    },

    async commitBatch(batch, _createdRecords, expenses, internalTransfers, investmentOperations, dividends) {
      const batchRef = adminDb.collection(BATCH_COLLECTION).doc(batch.id);
      const writeBatch = adminDb.batch();

      writeBatch.set(batchRef, removeUndefinedFields({
        ...batch,
        createdAt: Timestamp.fromDate(batch.createdAt),
        committedAt: Timestamp.fromDate(batch.committedAt),
        rolledBackAt: batch.rolledBackAt ? Timestamp.fromDate(batch.rolledBackAt) : null,
      }));

      expenses.forEach((expense) => {
        const expenseRef = adminDb.collection(EXPENSE_COLLECTION).doc(expense.id);
        writeBatch.set(expenseRef, removeUndefinedFields({
          userId: expense.userId,
          batchId: expense.batchId,
          importBatchId: expense.importBatchId,
          importIdempotencyKey: expense.importIdempotencyKey,
          importSourceFingerprint: expense.importSourceFingerprint,
          importPresetId: expense.importPresetId,
          importRowIndex: expense.rowIndex,
          importDedupeKey: expense.dedupeKey,
          type: expense.type,
          categoryId: expense.categoryId,
          categoryName: expense.categoryName,
          subCategoryId: expense.subCategoryId ?? null,
          subCategoryName: expense.subCategoryName ?? null,
          amount: expense.amount,
          currency: expense.currency,
          date: Timestamp.fromDate(expense.date),
          notes: expense.notes,
          createdAt: Timestamp.fromDate(expense.createdAt),
          updatedAt: Timestamp.fromDate(expense.updatedAt),
        }));
      });

      internalTransfers.forEach((transfer) => {
        const transferRef = adminDb.collection(INTERNAL_TRANSFER_COLLECTION).doc(transfer.id);
        writeBatch.set(transferRef, removeUndefinedFields({
          userId: transfer.userId,
          batchId: transfer.batchId,
          importBatchId: transfer.importBatchId,
          importIdempotencyKey: transfer.importIdempotencyKey,
          importSourceFingerprint: transfer.importSourceFingerprint,
          importPresetId: transfer.importPresetId,
          importRowIndex: transfer.rowIndex,
          importDedupeKey: transfer.dedupeKey,
          fromCashAssetId: transfer.fromCashAssetId,
          fromCashAssetName: transfer.fromCashAssetName,
          toCashAssetId: transfer.toCashAssetId,
          toCashAssetName: transfer.toCashAssetName,
          amount: transfer.amount,
          currency: transfer.currency,
          date: Timestamp.fromDate(transfer.date),
          fees: transfer.fees,
          purpose: transfer.purpose,
          notes: transfer.notes,
          createdAt: Timestamp.fromDate(transfer.createdAt),
          updatedAt: Timestamp.fromDate(transfer.updatedAt),
        }));
        writeBatch.update(adminDb.collection(ASSET_COLLECTION).doc(transfer.fromCashAssetId), {
          quantity: FieldValue.increment(-(transfer.amount + transfer.fees)),
          updatedAt: Timestamp.fromDate(transfer.updatedAt),
        });
        writeBatch.update(adminDb.collection(ASSET_COLLECTION).doc(transfer.toCashAssetId), {
          quantity: FieldValue.increment(transfer.amount),
          updatedAt: Timestamp.fromDate(transfer.updatedAt),
        });
      });

      investmentOperations.forEach((operation) => {
        const operationRef = adminDb.collection(INVESTMENT_OPERATION_COLLECTION).doc(operation.id);
        const assetRef = adminDb.collection(ASSET_COLLECTION).doc(operation.assetId);
        writeBatch.set(operationRef, removeUndefinedFields({
          userId: operation.userId,
          batchId: operation.batchId,
          importBatchId: operation.importBatchId,
          importRowIndex: operation.importRowIndex ?? operation.rowIndex,
          importDedupeKey: operation.importDedupeKey ?? operation.dedupeKey,
          importIdempotencyKey: operation.importIdempotencyKey,
          importSourceFingerprint: operation.importSourceFingerprint,
          importPresetId: operation.importPresetId,
          rowIndex: operation.rowIndex,
          dedupeKey: operation.dedupeKey,
          assetId: operation.assetId,
          assetName: operation.assetName,
          assetTicker: operation.assetTicker,
          type: operation.type,
          date: Timestamp.fromDate(operation.date),
          quantity: operation.quantity,
          pricePerUnit: operation.pricePerUnit,
          grossAmount: operation.grossAmount,
          fees: operation.fees,
          taxes: operation.taxes,
          currency: operation.currency,
          cashAssetId: operation.cashAssetId ?? null,
          cashAssetName: operation.cashAssetName ?? null,
          previousQuantity: operation.previousQuantity,
          previousAverageCost: operation.previousAverageCost,
          resultingQuantity: operation.resultingQuantity,
          resultingAverageCost: operation.resultingAverageCost,
          realizedGain: operation.realizedGain,
          realizedGainTax: operation.realizedGainTax,
          netCashEffect: operation.netCashEffect,
          notes: operation.notes,
          createdAt: Timestamp.fromDate(operation.createdAt),
          updatedAt: Timestamp.fromDate(operation.updatedAt),
        }));
        writeBatch.update(assetRef, {
          quantity: FieldValue.increment(operation.resultingQuantity - operation.previousQuantity),
          averageCost: operation.resultingAverageCost === undefined ? FieldValue.delete() : operation.resultingAverageCost,
          updatedAt: Timestamp.fromDate(operation.updatedAt),
        });
        if (operation.cashAssetId && Math.abs(operation.netCashEffect) > 0.000001) {
          writeBatch.update(adminDb.collection(ASSET_COLLECTION).doc(operation.cashAssetId), {
            quantity: FieldValue.increment(operation.netCashEffect),
            updatedAt: Timestamp.fromDate(operation.updatedAt),
          });
        }
      });

      dividends.forEach((dividend) => {
        const dividendRef = adminDb.collection(DIVIDEND_COLLECTION).doc(dividend.id);
        writeBatch.set(dividendRef, removeUndefinedFields({
          userId: dividend.userId,
          batchId: dividend.batchId,
          importBatchId: dividend.importBatchId,
          importRowIndex: dividend.importRowIndex ?? dividend.rowIndex,
          importDedupeKey: dividend.importDedupeKey ?? dividend.dedupeKey,
          importIdempotencyKey: dividend.importIdempotencyKey,
          importSourceFingerprint: dividend.importSourceFingerprint,
          importPresetId: dividend.importPresetId,
          rowIndex: dividend.rowIndex,
          dedupeKey: dividend.dedupeKey,
          assetId: dividend.assetId,
          assetName: dividend.assetName,
          assetTicker: dividend.assetTicker,
          assetIsin: dividend.assetIsin,
          exDate: Timestamp.fromDate(dividend.exDate),
          paymentDate: Timestamp.fromDate(dividend.paymentDate),
          dividendPerShare: dividend.dividendPerShare,
          quantity: dividend.quantity,
          grossAmount: dividend.grossAmount,
          taxAmount: dividend.taxAmount,
          netAmount: dividend.netAmount,
          currency: dividend.currency,
          dividendType: dividend.dividendType,
          notes: dividend.notes,
          isAutoGenerated: dividend.isAutoGenerated,
          expenseId: dividend.expenseId,
          grossAmountEur: dividend.grossAmountEur,
          taxAmountEur: dividend.taxAmountEur,
          netAmountEur: dividend.netAmountEur,
          exchangeRate: dividend.exchangeRate,
          costPerShare: dividend.costPerShare,
          linkedMovementReference: dividend.linkedMovementReference ?? null,
          createdAt: Timestamp.fromDate(dividend.createdAt),
          updatedAt: Timestamp.fromDate(dividend.updatedAt),
        }));
      });

      await writeBatch.commit();
    },

    async listExpensesByBatchId(batchId) {
      const snapshot = await adminDb
        .collection(EXPENSE_COLLECTION)
        .where('importBatchId', '==', batchId)
        .get();

      return snapshot.docs
        .map((doc) => mapExpense(doc.id, doc.data() as Record<string, unknown>))
        .sort((left, right) => left.rowIndex - right.rowIndex);
    },

    async listExpensesByUserAndDateRange(userId, startDate, endDate) {
      const snapshot = await adminDb
        .collection(EXPENSE_COLLECTION)
        .where('userId', '==', userId)
        .where('date', '>=', Timestamp.fromDate(startDate))
        .where('date', '<=', Timestamp.fromDate(endDate))
        .get();

      return snapshot.docs
        .map((doc) => mapExpense(doc.id, doc.data() as Record<string, unknown>))
        .sort((left, right) => left.date.getTime() - right.date.getTime());
    },

    async listInternalTransfersByBatchId(batchId) {
      const snapshot = await adminDb
        .collection(INTERNAL_TRANSFER_COLLECTION)
        .where('importBatchId', '==', batchId)
        .get();

      return snapshot.docs
        .map((doc) => mapInternalTransfer(doc.id, doc.data() as Record<string, unknown>))
        .sort((left, right) => left.rowIndex - right.rowIndex);
    },

    async listInvestmentOperationsByBatchId(batchId) {
      const snapshot = await adminDb
        .collection(INVESTMENT_OPERATION_COLLECTION)
        .where('importBatchId', '==', batchId)
        .get();

      return snapshot.docs
        .map((doc) => mapInvestmentOperation(doc.id, doc.data() as Record<string, unknown>))
        .sort((left, right) => left.rowIndex - right.rowIndex);
    },

    async listDividendsByBatchId(batchId) {
      const snapshot = await adminDb
        .collection(DIVIDEND_COLLECTION)
        .where('importBatchId', '==', batchId)
        .get();

      return snapshot.docs
        .map((doc) => mapDividend(doc.id, doc.data() as Record<string, unknown>))
        .sort((left, right) => left.rowIndex - right.rowIndex);
    },

    async rollbackBatch(batchId, expenseIds, internalTransferIds, investmentOperationIds, dividendIds, rolledBackAt, rollbackReason) {
      const batchRef = adminDb.collection(BATCH_COLLECTION).doc(batchId);
      const transferSnapshots = await Promise.all(
        internalTransferIds.map((transferId) => adminDb.collection(INTERNAL_TRANSFER_COLLECTION).doc(transferId).get())
      );
      const transfers = transferSnapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => mapInternalTransfer(snapshot.id, snapshot.data() as Record<string, unknown>));
      const investmentSnapshots = await Promise.all(
        investmentOperationIds.map((operationId) => adminDb.collection(INVESTMENT_OPERATION_COLLECTION).doc(operationId).get())
      );
      const investmentOperations = investmentSnapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => mapInvestmentOperation(snapshot.id, snapshot.data() as Record<string, unknown>))
        .sort((left, right) => left.rowIndex - right.rowIndex);
      const writeBatch = adminDb.batch();

      expenseIds.forEach((expenseId) => {
        writeBatch.delete(adminDb.collection(EXPENSE_COLLECTION).doc(expenseId));
      });

      transfers.forEach((transfer) => {
        writeBatch.update(adminDb.collection(ASSET_COLLECTION).doc(transfer.fromCashAssetId), {
          quantity: FieldValue.increment(transfer.amount + transfer.fees),
          updatedAt: Timestamp.fromDate(rolledBackAt),
        });
        writeBatch.update(adminDb.collection(ASSET_COLLECTION).doc(transfer.toCashAssetId), {
          quantity: FieldValue.increment(-transfer.amount),
          updatedAt: Timestamp.fromDate(rolledBackAt),
        });
      });

      internalTransferIds.forEach((transferId) => {
        writeBatch.delete(adminDb.collection(INTERNAL_TRANSFER_COLLECTION).doc(transferId));
      });

      [...investmentOperations].reverse().forEach((operation) => {
        writeBatch.update(adminDb.collection(ASSET_COLLECTION).doc(operation.assetId), {
          quantity: FieldValue.increment(operation.previousQuantity - operation.resultingQuantity),
          averageCost: operation.previousAverageCost === undefined ? FieldValue.delete() : operation.previousAverageCost,
          updatedAt: Timestamp.fromDate(rolledBackAt),
        });

        if (operation.cashAssetId && Math.abs(operation.netCashEffect) > 0.000001) {
          writeBatch.update(adminDb.collection(ASSET_COLLECTION).doc(operation.cashAssetId), {
            quantity: FieldValue.increment(-operation.netCashEffect),
            updatedAt: Timestamp.fromDate(rolledBackAt),
          });
        }
      });

      investmentOperationIds.forEach((operationId) => {
        writeBatch.delete(adminDb.collection(INVESTMENT_OPERATION_COLLECTION).doc(operationId));
      });

      dividendIds.forEach((dividendId) => {
        writeBatch.delete(adminDb.collection(DIVIDEND_COLLECTION).doc(dividendId));
      });

      writeBatch.update(batchRef, {
        status: 'rolledBack',
        rolledBackAt: Timestamp.fromDate(rolledBackAt),
        rollbackReason,
      });

      await writeBatch.commit();

      const updatedBatch = await batchRef.get();
      if (!updatedBatch.exists) {
        return null;
      }

      return mapBatch(updatedBatch.id, updatedBatch.data() as Record<string, unknown>);
    },
  };
}

export function createFirestoreCsvImportCashflowCategoryRepository() {
  return {
    async getById(categoryId: string) {
      const snapshot = await adminDb.collection('expenseCategories').doc(categoryId).get();

      if (!snapshot.exists) {
        return null;
      }

      const data = snapshot.data() as Record<string, unknown>;
      return {
        id: snapshot.id,
        userId: String(data.userId ?? ''),
        name: String(data.name ?? ''),
        type: data.type as CsvImportCashflowExpenseRecord['type'],
        subCategories: Array.isArray(data.subCategories)
          ? (data.subCategories as Array<{ id: string; name: string }>)
          : [],
      };
    },
  };
}

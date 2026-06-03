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
  CsvImportCashflowInternalTransferRecord,
} from '@/lib/server/imports/cashflowCommitTypes';

const BATCH_COLLECTION = 'csvImportBatches';
const ASSET_COLLECTION = 'assets';
const EXPENSE_COLLECTION = 'expenses';
const INTERNAL_TRANSFER_COLLECTION = 'internalTransfers';

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
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
    assetClass: (data.assetClass as CsvImportCashflowAssetRecord['assetClass']) ?? 'cash',
    currency: String(data.currency ?? 'EUR'),
    quantity: Number(data.quantity ?? 0),
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

    async commitBatch(batch, _createdRecords, expenses, internalTransfers) {
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

    async rollbackBatch(batchId, expenseIds, internalTransferIds, rolledBackAt, rollbackReason) {
      const batchRef = adminDb.collection(BATCH_COLLECTION).doc(batchId);
      const transferSnapshots = await Promise.all(
        internalTransferIds.map((transferId) => adminDb.collection(INTERNAL_TRANSFER_COLLECTION).doc(transferId).get())
      );
      const transfers = transferSnapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => mapInternalTransfer(snapshot.id, snapshot.data() as Record<string, unknown>));
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

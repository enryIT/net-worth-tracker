import type { ImportIssue, ImportDedupeStatus, ImportMovementKind, NormalizedCanonicalFields } from '@/lib/server/imports/types';
import type { AssetClass } from '@/types/assets';
import type { ExpenseType } from '@/types/expenses';
import type { InternalTransferPurpose } from '@/types/household';

export interface CsvImportCashflowCommitRowInput {
  rowIndex: number;
  movementKind: ImportMovementKind;
  ready: boolean;
  dedupeKey: string;
  dedupeStatus: ImportDedupeStatus;
  issues: ImportIssue[];
  canonicalFields: NormalizedCanonicalFields;
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId?: string | null;
  subCategoryName?: string | null;
}

export interface CsvImportCashflowCommitInput {
  userId?: string;
  idempotencyKey: string;
  rows: CsvImportCashflowCommitRowInput[];
  presetId?: string | null;
  sourceFingerprint?: string | null;
}

export interface CsvImportCashflowCreatedCashflowRecord {
  kind: 'cashflow';
  id: string;
  rowIndex: number;
  dedupeKey: string;
  amount: number;
  currency: string;
  type: ExpenseType;
  categoryId: string;
  categoryName: string;
  subCategoryId: string | null;
  subCategoryName: string | null;
}

export interface CsvImportCashflowCreatedInternalTransferRecord {
  kind: 'internalTransfer';
  id: string;
  rowIndex: number;
  dedupeKey: string;
  amount: number;
  currency: string;
  fromCashAssetId: string;
  fromCashAssetName: string;
  toCashAssetId: string;
  toCashAssetName: string;
  fees: number;
  purpose: InternalTransferPurpose;
}

export type CsvImportCashflowCreatedRecord =
  | CsvImportCashflowCreatedCashflowRecord
  | CsvImportCashflowCreatedInternalTransferRecord;

export interface CsvImportCashflowBatch {
  id: string;
  userId: string;
  idempotencyKey: string;
  presetId: string | null;
  sourceFingerprint: string | null;
  requestFingerprint: string;
  status: 'committed' | 'rolledBack';
  rowCount: number;
  createdRecordCount: number;
  duplicateCount: number;
  errorCount: number;
  createdRecords: CsvImportCashflowCreatedRecord[];
  createdAt: Date;
  committedAt: Date;
  rolledBackAt: Date | null;
  rollbackReason: string | null;
}

export interface CsvImportCashflowCommitResult {
  batch: CsvImportCashflowBatch;
  createdRecordCount: number;
  wasIdempotent: boolean;
}

export interface CsvImportCashflowRollbackResult {
  batch: CsvImportCashflowBatch;
  removedRecordCount: number;
}

export interface CsvImportCashflowExpenseRecord {
  id: string;
  userId: string;
  batchId: string;
  rowIndex: number;
  dedupeKey: string;
  type: ExpenseType;
  categoryId: string;
  categoryName: string;
  subCategoryId: string | null;
  subCategoryName: string | null;
  amount: number;
  currency: string;
  date: Date;
  notes: string;
  importBatchId: string;
  importIdempotencyKey: string;
  importSourceFingerprint: string | null;
  importPresetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsvImportCashflowInternalTransferRecord {
  id: string;
  userId: string;
  batchId: string;
  rowIndex: number;
  dedupeKey: string;
  fromCashAssetId: string;
  fromCashAssetName: string;
  toCashAssetId: string;
  toCashAssetName: string;
  amount: number;
  currency: string;
  date: Date;
  fees: number;
  purpose: InternalTransferPurpose;
  notes: string;
  importBatchId: string;
  importIdempotencyKey: string;
  importSourceFingerprint: string | null;
  importPresetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CsvImportCashflowAssetRecord {
  id: string;
  userId: string;
  name: string;
  assetClass: AssetClass;
  currency: string;
  quantity: number;
  updatedAt: Date;
}

export interface CsvImportCashflowCategoryRecord {
  id: string;
  userId: string;
  name: string;
  type: ExpenseType;
  subCategories: Array<{ id: string; name: string }>;
}

export interface CsvImportCashflowBatchRepository {
  getById(batchId: string): Promise<CsvImportCashflowBatch | null>;
  getByUserAndIdempotencyKey(userId: string, idempotencyKey: string): Promise<CsvImportCashflowBatch | null>;
  listCommittedByUserId(userId: string): Promise<CsvImportCashflowBatch[]>;
  getCashAssetById(assetId: string): Promise<CsvImportCashflowAssetRecord | null>;
  commitBatch(
    batch: CsvImportCashflowBatch,
    createdRecords: CsvImportCashflowCreatedRecord[],
    expenses: CsvImportCashflowExpenseRecord[],
    internalTransfers: CsvImportCashflowInternalTransferRecord[]
  ): Promise<void>;
  listExpensesByBatchId(batchId: string): Promise<CsvImportCashflowExpenseRecord[]>;
  listInternalTransfersByBatchId(batchId: string): Promise<CsvImportCashflowInternalTransferRecord[]>;
  listExpensesByUserAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<CsvImportCashflowExpenseRecord[]>;
  rollbackBatch(
    batchId: string,
    expenseIds: string[],
    internalTransferIds: string[],
    rolledBackAt: Date,
    rollbackReason: string
  ): Promise<CsvImportCashflowBatch | null>;
}

export interface CsvImportCashflowCategoryRepository {
  getById(categoryId: string): Promise<CsvImportCashflowCategoryRecord | null>;
}

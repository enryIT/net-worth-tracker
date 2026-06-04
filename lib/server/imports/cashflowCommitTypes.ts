import type { ImportIssue, ImportDedupeStatus, ImportMovementKind, NormalizedCanonicalFields } from '@/lib/server/imports/types';
import type { AssetClass } from '@/types/assets';
import type { ExpenseType } from '@/types/expenses';
import type { InternalTransferPurpose } from '@/types/household';
import type { InvestmentOperationType } from '@/types/investments';

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

export interface CsvImportCashflowCreatedInvestmentOperationRecord {
  kind: 'investmentOperation';
  id: string;
  rowIndex: number;
  dedupeKey: string;
  assetId: string;
  assetName: string;
  assetTicker: string;
  type: InvestmentOperationType;
  quantity: number;
  pricePerUnit: number;
  grossAmount: number;
  fees: number;
  taxes: number;
  currency: string;
  cashAssetId: string | null;
  cashAssetName: string | null;
  resultingQuantity: number;
  resultingAverageCost?: number;
  realizedGain?: number;
  realizedGainTax?: number;
  netCashEffect: number;
}

export type CsvImportCashflowCreatedRecord =
  | CsvImportCashflowCreatedCashflowRecord
  | CsvImportCashflowCreatedInternalTransferRecord
  | CsvImportCashflowCreatedInvestmentOperationRecord;

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

export interface CsvImportCashflowInvestmentOperationRecord {
  id: string;
  userId: string;
  batchId: string;
  rowIndex: number;
  dedupeKey: string;
  assetId: string;
  assetName: string;
  assetTicker: string;
  type: InvestmentOperationType;
  date: Date;
  quantity: number;
  pricePerUnit: number;
  grossAmount: number;
  fees: number;
  taxes: number;
  currency: string;
  cashAssetId: string | null;
  cashAssetName: string | null;
  previousQuantity: number;
  previousAverageCost?: number;
  resultingQuantity: number;
  resultingAverageCost?: number;
  realizedGain?: number;
  realizedGainTax?: number;
  netCashEffect: number;
  notes: string;
  importBatchId: string;
  importRowIndex?: number;
  importDedupeKey?: string;
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
  ticker?: string;
  isin?: string;
  assetClass: AssetClass;
  currency: string;
  quantity: number;
  averageCost?: number;
  updatedAt: Date;
}

export interface CsvImportCashflowAssetReference {
  assetTicker: string | null;
  assetIsin: string | null;
  assetName: string | null;
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
  getAssetById(assetId: string): Promise<CsvImportCashflowAssetRecord | null>;
  getCashAssetById(assetId: string): Promise<CsvImportCashflowAssetRecord | null>;
  getInvestmentAssetByConfirmedReference(
    userId: string,
    reference: CsvImportCashflowAssetReference
  ): Promise<CsvImportCashflowAssetRecord | null>;
  commitBatch(
    batch: CsvImportCashflowBatch,
    createdRecords: CsvImportCashflowCreatedRecord[],
    expenses: CsvImportCashflowExpenseRecord[],
    internalTransfers: CsvImportCashflowInternalTransferRecord[],
    investmentOperations: CsvImportCashflowInvestmentOperationRecord[]
  ): Promise<void>;
  listExpensesByBatchId(batchId: string): Promise<CsvImportCashflowExpenseRecord[]>;
  listInternalTransfersByBatchId(batchId: string): Promise<CsvImportCashflowInternalTransferRecord[]>;
  listInvestmentOperationsByBatchId(batchId: string): Promise<CsvImportCashflowInvestmentOperationRecord[]>;
  listExpensesByUserAndDateRange(userId: string, startDate: Date, endDate: Date): Promise<CsvImportCashflowExpenseRecord[]>;
  rollbackBatch(
    batchId: string,
    expenseIds: string[],
    internalTransferIds: string[],
    investmentOperationIds: string[],
    rolledBackAt: Date,
    rollbackReason: string
  ): Promise<CsvImportCashflowBatch | null>;
}

export interface CsvImportCashflowCategoryRepository {
  getById(categoryId: string): Promise<CsvImportCashflowCategoryRecord | null>;
}

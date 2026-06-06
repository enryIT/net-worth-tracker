import { toDate } from '@/lib/utils/dateHelpers';
import type { CsvImportCashflowBatch } from '@/lib/server/imports/cashflowCommitTypes';

export interface CsvImportCashflowBatchApiRecord extends Omit<CsvImportCashflowBatch, 'createdAt' | 'committedAt' | 'rolledBackAt'> {
  createdAt: string | Date;
  committedAt: string | Date;
  rolledBackAt: string | Date | null;
}

export function normalizeCsvImportCashflowBatchApiRecord(
  batch: CsvImportCashflowBatchApiRecord
): CsvImportCashflowBatch {
  return {
    ...batch,
    createdAt: toDate(batch.createdAt),
    committedAt: toDate(batch.committedAt),
    rolledBackAt: batch.rolledBackAt ? toDate(batch.rolledBackAt) : null,
  };
}

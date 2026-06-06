import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createCsvImportCashflowCommitService } from '@/lib/server/imports/cashflowCommitService';
import type {
  CsvImportCashflowBatch,
  CsvImportCashflowBatchRepository,
  CsvImportCashflowCategoryRepository,
  CsvImportCashflowCreatedRecord,
} from '@/lib/server/imports/cashflowCommitTypes';

type MockBatch = CsvImportCashflowBatch & {
  importRunId: string | null;
  importChunkIndex: number | null;
  importChunkCount: number | null;
};

type CsvImportCashflowImportRunService = Pick<
  ReturnType<typeof createCsvImportCashflowCommitService>,
  'listImportRuns' | 'rollbackImportRun'
>;

function createBatchRepository(initialBatches: MockBatch[] = []): CsvImportCashflowBatchRepository {
  const batches = new Map(initialBatches.map((batch) => [batch.id, batch]));

  return {
    async getById(batchId: string) {
      return batches.get(batchId) ?? null;
    },
    async getByUserAndIdempotencyKey(userId: string, idempotencyKey: string) {
      return Array.from(batches.values()).find((batch) => (
        batch.userId === userId && batch.idempotencyKey === idempotencyKey
      )) ?? null;
    },
    async listByUserId(userId: string) {
      return Array.from(batches.values())
        .filter((batch) => batch.userId === userId)
        .sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime());
    },
    async listCommittedByUserId(userId: string) {
      return Array.from(batches.values()).filter(
        (batch) => batch.userId === userId && batch.status === 'committed'
      );
    },
    async getAssetById() {
      return null;
    },
    async getCashAssetById() {
      return null;
    },
    async getInvestmentAssetByConfirmedReference() {
      return null;
    },
    async commitBatch(batch: CsvImportCashflowBatch) {
      batches.set(batch.id, batch as MockBatch);
    },
    async listExpensesByBatchId() {
      return [];
    },
    async listInternalTransfersByBatchId() {
      return [];
    },
    async listInvestmentOperationsByBatchId() {
      return [];
    },
    async listDividendsByBatchId() {
      return [];
    },
    async listExpensesByUserAndDateRange() {
      return [];
    },
    async rollbackBatch(
      batchId: string,
      _expenseIds: string[],
      _internalTransferIds: string[],
      _investmentOperationIds: string[],
      _dividendIds: string[],
      rolledBackAt: Date,
      rollbackReason: string
    ) {
      const batch = batches.get(batchId);
      if (!batch) {
        return null;
      }

      const updatedBatch: MockBatch = {
        ...batch,
        status: 'rolledBack',
        rolledBackAt,
        rollbackReason,
      };
      batches.set(batchId, updatedBatch);
      return updatedBatch;
    },
  };
}

function createCategoryRepository(): CsvImportCashflowCategoryRepository {
  return {
    async getById() {
      return null;
    },
  };
}

function createCreatedRecord(kind: CsvImportCashflowCreatedRecord['kind']): CsvImportCashflowCreatedRecord {
  switch (kind) {
    case 'cashflow':
      return {
        kind,
        id: `${kind}-1`,
        rowIndex: 1,
        dedupeKey: `${kind}-dedupe-1`,
        amount: 100,
        currency: 'EUR',
        type: 'income',
        categoryId: 'income-salary',
        categoryName: 'Stipendio',
        subCategoryId: null,
        subCategoryName: null,
      };
    case 'internalTransfer':
      return {
        kind,
        id: `${kind}-1`,
        rowIndex: 1,
        dedupeKey: `${kind}-dedupe-1`,
        amount: 100,
        currency: 'EUR',
        fromCashAssetId: 'cash-from',
        fromCashAssetName: 'Conto origine',
        toCashAssetId: 'cash-to',
        toCashAssetName: 'Conto destinazione',
        fees: 0,
        purpose: 'neutral_transfer',
      };
    case 'investmentOperation':
      return {
        kind,
        id: `${kind}-1`,
        rowIndex: 1,
        dedupeKey: `${kind}-dedupe-1`,
        assetId: 'asset-1',
        assetName: 'ETF',
        assetTicker: 'ETF',
        type: 'buy',
        quantity: 1,
        pricePerUnit: 100,
        grossAmount: 100,
        fees: 0,
        taxes: 0,
        currency: 'EUR',
        cashAssetId: null,
        cashAssetName: null,
        resultingQuantity: 1,
        resultingAverageCost: 100,
        netCashEffect: -100,
      };
    case 'dividend':
      return {
        kind,
        id: `${kind}-1`,
        rowIndex: 1,
        dedupeKey: `${kind}-dedupe-1`,
        assetId: 'asset-1',
        assetName: 'ETF',
        assetTicker: 'ETF',
        assetIsin: 'IT0000000001',
        exDate: '2026-06-01',
        paymentDate: '2026-06-02',
        dividendPerShare: 1,
        quantity: 1,
        grossAmount: 1,
        taxAmount: 0,
        netAmount: 1,
        currency: 'EUR',
        dividendType: 'ordinary',
      };
    default:
      throw new Error(`Unsupported kind: ${kind satisfies never}`);
  }
}

describe('CSV import import run service', () => {
  it('groups child batches by importRunId and aggregates counts', async () => {
    const repository = createBatchRepository([
      {
        id: 'batch-2',
        userId: 'user-1',
        idempotencyKey: 'idempotency-2',
        presetId: 'preset-1',
        sourceFingerprint: 'fingerprint-1',
        requestFingerprint: 'request-2',
        importRunId: 'import-run-1',
        importChunkIndex: 2,
        importChunkCount: 2,
        status: 'committed',
        rowCount: 120,
        createdRecordCount: 2,
        duplicateCount: 1,
        errorCount: 0,
        createdRecords: [createCreatedRecord('cashflow'), createCreatedRecord('dividend')],
        createdAt: new Date('2026-06-03T09:05:00.000Z'),
        committedAt: new Date('2026-06-03T09:06:00.000Z'),
        rolledBackAt: null,
        rollbackReason: null,
      },
      {
        id: 'batch-1',
        userId: 'user-1',
        idempotencyKey: 'idempotency-1',
        presetId: 'preset-1',
        sourceFingerprint: 'fingerprint-1',
        requestFingerprint: 'request-1',
        importRunId: 'import-run-1',
        importChunkIndex: 1,
        importChunkCount: 2,
        status: 'committed',
        rowCount: 250,
        createdRecordCount: 3,
        duplicateCount: 0,
        errorCount: 2,
        createdRecords: [
          createCreatedRecord('cashflow'),
          createCreatedRecord('internalTransfer'),
          createCreatedRecord('investmentOperation'),
        ],
        createdAt: new Date('2026-06-03T09:00:00.000Z'),
        committedAt: new Date('2026-06-03T09:01:00.000Z'),
        rolledBackAt: null,
        rollbackReason: null,
      },
      {
        id: 'legacy-batch',
        userId: 'user-1',
        idempotencyKey: 'idempotency-legacy',
        presetId: null,
        sourceFingerprint: null,
        requestFingerprint: 'request-legacy',
        importRunId: null,
        importChunkIndex: null,
        importChunkCount: null,
        status: 'rolledBack',
        rowCount: 15,
        createdRecordCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        createdRecords: [createCreatedRecord('cashflow')],
        createdAt: new Date('2026-06-01T09:00:00.000Z'),
        committedAt: new Date('2026-06-01T09:01:00.000Z'),
        rolledBackAt: new Date('2026-06-01T09:15:00.000Z'),
        rollbackReason: 'annullamento manuale',
      },
    ]);

    const service: CsvImportCashflowImportRunService = createCsvImportCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository(),
      now: () => new Date('2026-06-03T09:30:00.000Z'),
      generateId: () => 'generated-id',
      invalidateDashboardOverviewSummaryServer: vi.fn().mockResolvedValue(undefined),
    });

    const runs = await service.listImportRuns('user-1');

    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({
      importRunId: 'import-run-1',
      childBatchCount: 2,
      committedChildBatchCount: 2,
      rolledBackChildBatchCount: 0,
      rowCount: 370,
      createdRecordCount: 5,
      duplicateCount: 1,
      errorCount: 2,
      status: 'committed',
      canRollbackGrouped: true,
    });
    expect(runs[0].childBatches.map((batch: MockBatch) => batch.id)).toEqual(['batch-1', 'batch-2']);
    expect(runs[1]).toMatchObject({
      importRunId: 'legacy-batch',
      childBatchCount: 1,
      committedChildBatchCount: 0,
      rolledBackChildBatchCount: 1,
      rowCount: 15,
      createdRecordCount: 1,
      duplicateCount: 0,
      errorCount: 0,
      status: 'rolledBack',
      canRollbackGrouped: false,
    });
  });

  it('rolls back a grouped import run from the latest child batch to the earliest child batch', async () => {
    const repository = createBatchRepository([
      {
        id: 'batch-2',
        userId: 'user-1',
        idempotencyKey: 'idempotency-2',
        presetId: 'preset-1',
        sourceFingerprint: 'fingerprint-1',
        requestFingerprint: 'request-2',
        importRunId: 'import-run-1',
        importChunkIndex: 2,
        importChunkCount: 2,
        status: 'committed',
        rowCount: 120,
        createdRecordCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        createdRecords: [createCreatedRecord('cashflow')],
        createdAt: new Date('2026-06-03T09:05:00.000Z'),
        committedAt: new Date('2026-06-03T09:06:00.000Z'),
        rolledBackAt: null,
        rollbackReason: null,
      },
      {
        id: 'batch-1',
        userId: 'user-1',
        idempotencyKey: 'idempotency-1',
        presetId: 'preset-1',
        sourceFingerprint: 'fingerprint-1',
        requestFingerprint: 'request-1',
        importRunId: 'import-run-1',
        importChunkIndex: 1,
        importChunkCount: 2,
        status: 'committed',
        rowCount: 250,
        createdRecordCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        createdRecords: [createCreatedRecord('cashflow')],
        createdAt: new Date('2026-06-03T09:00:00.000Z'),
        committedAt: new Date('2026-06-03T09:01:00.000Z'),
        rolledBackAt: null,
        rollbackReason: null,
      },
    ]);

    const service: CsvImportCashflowImportRunService = createCsvImportCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository(),
      now: () => new Date('2026-06-03T09:30:00.000Z'),
      generateId: () => 'generated-id',
      invalidateDashboardOverviewSummaryServer: vi.fn().mockResolvedValue(undefined),
    });

    const result = await service.rollbackImportRun('user-1', 'import-run-1', 'annullamento raggruppato');

    expect(result).toMatchObject({
      importRunId: 'import-run-1',
      status: 'rolledBack',
      childBatchCount: 2,
      rolledBackChildBatchCount: 2,
      unsafeChildBatchCount: 0,
      removedRecordCount: 2,
    });
    expect(result.childResults.map((child: { batchId: string }) => child.batchId)).toEqual(['batch-2', 'batch-1']);
    expect(result.childResults.every((child: { status: string }) => child.status === 'rolledBack')).toBe(true);
  });
});

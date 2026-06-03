import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  createCsvImportCashflowCommitService,
} from '@/lib/server/imports/cashflowCommitService';
import type {
  CsvImportCashflowAssetRecord,
  CsvImportCashflowCreatedRecord,
  CsvImportCashflowExpenseRecord,
  CsvImportCashflowInternalTransferRecord,
} from '@/lib/server/imports/cashflowCommitTypes';

type MockExpenseType = 'fixed' | 'variable' | 'debt' | 'income';

interface MockCategory {
  id: string;
  userId: string;
  name: string;
  type: MockExpenseType;
  subCategories: Array<{ id: string; name: string }>;
}

type MockCommittedRecord = CsvImportCashflowExpenseRecord;
type MockInternalTransferRecord = CsvImportCashflowInternalTransferRecord;
type MockAssetRecord = CsvImportCashflowAssetRecord;
type CommitServiceDependencies = Parameters<typeof createCsvImportCashflowCommitService>[0];

interface MockBatch {
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

function createCategoryRepository(categories: MockCategory[]) {
  const store = new Map(categories.map((category) => [category.id, category]));

  return {
    async getById(categoryId: string) {
      return store.get(categoryId) ?? null;
    },
  };
}

function createBatchRepository(
  initialBatches: MockBatch[] = [],
  initialExpenses: MockCommittedRecord[] = [],
  initialTransfers: MockInternalTransferRecord[] = [],
  initialAssets: MockAssetRecord[] = []
) {
  const batches = new Map(initialBatches.map((batch) => [batch.id, batch]));
  const expenses = new Map(initialExpenses.map((expense) => [expense.id, expense]));
  const transfers = new Map(initialTransfers.map((transfer) => [transfer.id, transfer]));
  const assets = new Map(initialAssets.map((asset) => [asset.id, asset]));

  return {
    async getById(batchId: string) {
      return batches.get(batchId) ?? null;
    },
    async getByUserAndIdempotencyKey(userId: string, idempotencyKey: string) {
      return Array.from(batches.values()).find((batch) => (
        batch.userId === userId && batch.idempotencyKey === idempotencyKey
      )) ?? null;
    },
    async listCommittedByUserId(userId: string) {
      return Array.from(batches.values()).filter(
        (batch) => batch.userId === userId && batch.status === 'committed'
      );
    },
    async getCashAssetById(assetId: string) {
      return assets.get(assetId) ?? null;
    },
    async commitBatch(
      batch: MockBatch,
      createdRecords: CsvImportCashflowCreatedRecord[],
      createdExpenses: MockCommittedRecord[] = [],
      createdTransfers: MockInternalTransferRecord[] = []
    ) {
      batches.set(batch.id, batch);
      createdExpenses.forEach((record) => {
        expenses.set(record.id, record);
      });
      createdTransfers.forEach((record) => {
        const fromAsset = assets.get(record.fromCashAssetId);
        const toAsset = assets.get(record.toCashAssetId);
        if (fromAsset) {
          assets.set(fromAsset.id, {
            ...fromAsset,
            quantity: fromAsset.quantity - record.amount - record.fees,
            updatedAt: record.updatedAt,
          });
        }
        if (toAsset) {
          assets.set(toAsset.id, {
            ...toAsset,
            quantity: toAsset.quantity + record.amount,
            updatedAt: record.updatedAt,
          });
        }
        transfers.set(record.id, record);
      });
    },
    async listExpensesByBatchId(batchId: string) {
      return Array.from(expenses.values()).filter((expense) => expense.importBatchId === batchId);
    },
    async listInternalTransfersByBatchId(batchId: string) {
      return Array.from(transfers.values()).filter((transfer) => transfer.importBatchId === batchId);
    },
    async listExpensesByUserAndDateRange(userId: string, startDate: Date, endDate: Date) {
      return Array.from(expenses.values()).filter((expense) => (
        expense.userId === userId
        && expense.date.getTime() >= startDate.getTime()
        && expense.date.getTime() <= endDate.getTime()
      ));
    },
    async rollbackBatch(
      batchId: string,
      expenseIds: string[],
      transferIds: string[],
      rolledBackAt: Date,
      rollbackReason: string
    ) {
      expenseIds.forEach((expenseId) => {
        expenses.delete(expenseId);
      });
      transferIds.forEach((transferId) => {
        const transfer = transfers.get(transferId);
        if (!transfer) return;
        const fromAsset = assets.get(transfer.fromCashAssetId);
        const toAsset = assets.get(transfer.toCashAssetId);
        if (fromAsset) {
          assets.set(fromAsset.id, {
            ...fromAsset,
            quantity: fromAsset.quantity + transfer.amount + transfer.fees,
            updatedAt: rolledBackAt,
          });
        }
        if (toAsset) {
          assets.set(toAsset.id, {
            ...toAsset,
            quantity: toAsset.quantity - transfer.amount,
            updatedAt: rolledBackAt,
          });
        }
        transfers.delete(transferId);
      });

      const batch = batches.get(batchId);
      if (!batch) {
        return null;
      }

      const updatedBatch = {
        ...batch,
        status: 'rolledBack' as const,
        rolledBackAt,
        rollbackReason,
      };
      batches.set(batchId, updatedBatch);
      return updatedBatch;
    },
    getExpenseById(expenseId: string) {
      return expenses.get(expenseId) ?? null;
    },
    mutateExpense(expenseId: string, patch: Partial<MockCommittedRecord>) {
      const current = expenses.get(expenseId);
      if (!current) {
        return;
      }

      expenses.set(expenseId, {
        ...current,
        ...patch,
      });
    },
    getExpenseCount() {
      return expenses.size;
    },
    getTransferCount() {
      return transfers.size;
    },
    getTransferById(transferId: string) {
      return transfers.get(transferId) ?? null;
    },
    mutateTransfer(transferId: string, patch: Partial<MockInternalTransferRecord>) {
      const current = transfers.get(transferId);
      if (!current) return;
      transfers.set(transferId, { ...current, ...patch });
    },
    getAssetById(assetId: string) {
      return assets.get(assetId) ?? null;
    },
    getBatchCount() {
      return batches.size;
    },
  };
}

function createExpenseRecord(overrides: Partial<MockCommittedRecord> = {}): MockCommittedRecord {
  return {
    id: 'expense-manual-1',
    userId: 'user-1',
    batchId: 'manual-batch-1',
    rowIndex: 1,
    dedupeKey: 'manual|2026-05-01|2500.000000|eur|stipendio',
    type: 'income',
    categoryId: 'income-bonus',
    categoryName: 'Bonus',
    subCategoryId: null,
    subCategoryName: null,
    amount: 2500,
    currency: 'EUR',
    date: new Date('2026-05-01T10:00:00.000Z'),
    notes: 'Stipendio',
    importBatchId: 'manual-batch-1',
    importIdempotencyKey: 'manual-idempotency',
    importSourceFingerprint: null,
    importPresetId: null,
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createCashflowRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rowIndex: 1,
    movementKind: 'cashflow' as const,
    ready: true,
    issues: [],
    dedupeKey: 'cashflow|2026-05-01|2500.000000|eur|stipendio',
    dedupeStatus: 'unique' as const,
    canonicalFields: {
      date: '2026-05-01',
      description: 'Stipendio',
      amount: 2500,
      currency: 'EUR',
      sourceType: null,
      sourceAccount: null,
      destinationAccount: null,
      assetTicker: null,
      assetIsin: null,
      assetName: null,
      quantity: null,
      unitPrice: null,
      fees: null,
      taxes: null,
    },
    categoryId: 'income-salary',
    categoryName: 'Stipendio',
    subCategoryId: null,
    subCategoryName: null,
    ...overrides,
  };
}

function createTransferRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rowIndex: 3,
    movementKind: 'transfer' as const,
    ready: true,
    issues: [],
    dedupeKey: 'transfer|2026-05-03|400.000000|eur|giroconto liquidita',
    dedupeStatus: 'unique' as const,
    canonicalFields: {
      date: '2026-05-03',
      description: 'Giroconto liquidità',
      amount: 400,
      currency: 'EUR',
      sourceType: null,
      sourceAccount: 'cash-source',
      destinationAccount: 'cash-destination',
      assetTicker: null,
      assetIsin: null,
      assetName: null,
      quantity: null,
      unitPrice: null,
      fees: 2,
      taxes: null,
    },
    categoryId: null,
    categoryName: null,
    subCategoryId: null,
    subCategoryName: null,
    ...overrides,
  };
}

function createCashAsset(overrides: Partial<MockAssetRecord> = {}): MockAssetRecord {
  return {
    id: 'cash-source',
    userId: 'user-1',
    name: 'Conto origine',
    assetClass: 'cash',
    currency: 'EUR',
    quantity: 1000,
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createStubbedCashflowCommitService(dependencies: CommitServiceDependencies = {}) {
  const invalidateDashboardOverviewSummaryServerMock = vi.fn().mockResolvedValue(undefined);

  return {
    service: createCsvImportCashflowCommitService({
      ...dependencies,
      invalidateDashboardOverviewSummaryServer: invalidateDashboardOverviewSummaryServerMock,
    }),
    invalidateDashboardOverviewSummaryServerMock,
  };
}

describe('csv import cashflow commit service', () => {
  it('commits ready cashflow rows with sign-preserving records and idempotent batch reuse', async () => {
    const repository = createBatchRepository();
    const {
      service,
      invalidateDashboardOverviewSummaryServerMock,
    } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([
        {
          id: 'income-salary',
          userId: 'user-1',
          name: 'Stipendio',
          type: 'income',
          subCategories: [],
        },
        {
          id: 'expense-groceries',
          userId: 'user-1',
          name: 'Spesa alimentare',
          type: 'variable',
          subCategories: [
            { id: 'sub-groceries', name: 'Supermercato' },
          ],
        },
      ]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'expense-1', 'expense-2'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    const input = {
      idempotencyKey: 'idempotency-1',
      presetId: 'preset-1',
      sourceFingerprint: 'fingerprint-1',
      rows: [
        createCashflowRow(),
        createCashflowRow({
          rowIndex: 2,
          dedupeKey: 'cashflow|2026-05-02|-95.300000|eur|spesa supermercato',
          canonicalFields: {
            date: '2026-05-02',
            description: 'Spesa supermercato',
            amount: -95.3,
            currency: 'EUR',
            sourceType: null,
            sourceAccount: null,
            destinationAccount: null,
            assetTicker: null,
            assetIsin: null,
            assetName: null,
            quantity: null,
            unitPrice: null,
            fees: null,
            taxes: null,
          },
          categoryId: 'expense-groceries',
          categoryName: 'Spesa alimentare',
          subCategoryId: 'sub-groceries',
          subCategoryName: 'Supermercato',
        }),
      ],
    };

    const firstResult = await service.commitBatch('user-1', input);

    expect(firstResult).toMatchObject({
      batch: {
        id: 'batch-1',
        userId: 'user-1',
        idempotencyKey: 'idempotency-1',
        presetId: 'preset-1',
        sourceFingerprint: 'fingerprint-1',
        status: 'committed',
        rowCount: 2,
        createdRecordCount: 2,
        duplicateCount: 0,
        errorCount: 0,
      },
      createdRecordCount: 2,
      wasIdempotent: false,
    });

    expect(firstResult.batch.createdRecords).toEqual([
      expect.objectContaining({
        id: 'expense-1',
        rowIndex: 1,
        dedupeKey: 'cashflow|2026-05-01|2500.000000|eur|stipendio',
        amount: 2500,
        type: 'income',
      }),
      expect.objectContaining({
        id: 'expense-2',
        rowIndex: 2,
        dedupeKey: 'cashflow|2026-05-02|-95.300000|eur|spesa supermercato',
        amount: -95.3,
        type: 'variable',
      }),
    ]);

    expect(repository.getExpenseCount()).toBe(2);
    expect(invalidateDashboardOverviewSummaryServerMock).toHaveBeenCalledTimes(1);
    expect(invalidateDashboardOverviewSummaryServerMock).toHaveBeenCalledWith(
      'user-1',
      'csv_import_cashflow_committed'
    );

    const secondResult = await service.commitBatch('user-1', input);
    expect(secondResult).toMatchObject({
      batch: {
        id: 'batch-1',
        status: 'committed',
      },
      createdRecordCount: 2,
      wasIdempotent: true,
    });
    expect(repository.getBatchCount()).toBe(1);
    expect(repository.getExpenseCount()).toBe(2);
    expect(invalidateDashboardOverviewSummaryServerMock).toHaveBeenCalledTimes(1);
  });

  it('commits internal transfer rows as neutral KPI records and rolls them back with cash balances', async () => {
    const repository = createBatchRepository([], [], [], [
      createCashAsset(),
      createCashAsset({
        id: 'cash-destination',
        name: 'Conto destinazione',
        quantity: 100,
      }),
    ]);
    const {
      service,
      invalidateDashboardOverviewSummaryServerMock,
    } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'transfer-1'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    const committed = await service.commitBatch('user-1', {
      idempotencyKey: 'idempotency-transfer-1',
      rows: [createTransferRow()],
    });

    expect(committed).toMatchObject({
      batch: {
        id: 'batch-1',
        createdRecordCount: 1,
        createdRecords: [
          {
            kind: 'internalTransfer',
            id: 'transfer-1',
            rowIndex: 3,
            dedupeKey: 'transfer|2026-05-03|400.000000|eur|giroconto liquidita',
            amount: 400,
            currency: 'EUR',
            fromCashAssetId: 'cash-source',
            fromCashAssetName: 'Conto origine',
            toCashAssetId: 'cash-destination',
            toCashAssetName: 'Conto destinazione',
            purpose: 'neutral_transfer',
          },
        ],
      },
      createdRecordCount: 1,
      wasIdempotent: false,
    });
    expect(repository.getExpenseCount()).toBe(0);
    expect(repository.getTransferCount()).toBe(1);
    expect(repository.getTransferById('transfer-1')).toMatchObject({
      importBatchId: 'batch-1',
      importIdempotencyKey: 'idempotency-transfer-1',
      purpose: 'neutral_transfer',
      amount: 400,
      fees: 2,
    });
    expect(repository.getAssetById('cash-source')?.quantity).toBe(598);
    expect(repository.getAssetById('cash-destination')?.quantity).toBe(500);

    const rollback = await service.rollbackBatch('user-1', 'batch-1', 'annullamento transfer');

    expect(rollback).toMatchObject({
      batch: {
        id: 'batch-1',
        status: 'rolledBack',
        rollbackReason: 'annullamento transfer',
      },
      removedRecordCount: 1,
    });
    expect(repository.getTransferCount()).toBe(0);
    expect(repository.getAssetById('cash-source')?.quantity).toBe(1000);
    expect(repository.getAssetById('cash-destination')?.quantity).toBe(100);
    expect(invalidateDashboardOverviewSummaryServerMock).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'csv_import_cashflow_committed'
    );
    expect(invalidateDashboardOverviewSummaryServerMock).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'csv_import_cashflow_rolled_back'
    );
  });

  it('rejects transfer rows with invalid or non-owned cash asset references', async () => {
    const { service } = createStubbedCashflowCommitService({
      repository: createBatchRepository([], [], [], [
        createCashAsset(),
        createCashAsset({
          id: 'cash-destination',
          quantity: 100,
        }),
        createCashAsset({
          id: 'stock-asset',
          name: 'ETF non cash',
          assetClass: 'equity',
        }),
        createCashAsset({
          id: 'other-user-cash',
          userId: 'user-2',
        }),
      ]),
      categoryRepository: createCategoryRepository([]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'transfer-1'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    await expect(
      service.commitBatch('user-1', {
        idempotencyKey: 'idempotency-transfer-same-account',
        rows: [
          createTransferRow({
            canonicalFields: {
              ...createTransferRow().canonicalFields,
              destinationAccount: 'cash-source',
            },
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      service.commitBatch('user-1', {
        idempotencyKey: 'idempotency-transfer-non-cash',
        rows: [
          createTransferRow({
            canonicalFields: {
              ...createTransferRow().canonicalFields,
              destinationAccount: 'stock-asset',
            },
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      service.commitBatch('user-1', {
        idempotencyKey: 'idempotency-transfer-other-user',
        rows: [
          createTransferRow({
            canonicalFields: {
              ...createTransferRow().canonicalFields,
              destinationAccount: 'other-user-cash',
            },
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('blocks rollback when an imported internal transfer was manually edited after commit', async () => {
    const repository = createBatchRepository([], [], [], [
      createCashAsset(),
      createCashAsset({ id: 'cash-destination', quantity: 100 }),
    ]);
    const { service } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'transfer-1'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    const committed = await service.commitBatch('user-1', {
      idempotencyKey: 'idempotency-transfer-rollback-unsafe',
      rows: [createTransferRow()],
    });
    repository.mutateTransfer('transfer-1', {
      updatedAt: new Date('2026-06-03T11:00:00.000Z'),
    });

    await expect(
      service.rollbackBatch('user-1', committed.batch.id, 'rollback non sicuro')
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rejects unsupported non-cashflow rows and cashflow rows missing confirmed category references', async () => {
    const { service } = createStubbedCashflowCommitService({
      repository: createBatchRepository(),
      categoryRepository: createCategoryRepository([
        {
          id: 'income-salary',
          userId: 'user-1',
          name: 'Stipendio',
          type: 'income',
          subCategories: [],
        },
      ]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'expense-1'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    await expect(
      service.commitBatch('user-1', {
        idempotencyKey: 'idempotency-2',
        rows: [
          createCashflowRow({
            movementKind: 'investmentOperation',
            rowIndex: 1,
          }),
        ],
      })
    ).rejects.toMatchObject({
      status: 400,
    });

    await expect(
      service.commitBatch('user-1', {
        idempotencyKey: 'idempotency-3',
        rows: [
          createCashflowRow({
            rowIndex: 1,
            categoryId: '',
            categoryName: '',
          }),
        ],
      })
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('blocks conservative duplicates already committed in the import batch scope', async () => {
    const committedBatch: MockBatch = {
      id: 'batch-existing',
      userId: 'user-1',
      idempotencyKey: 'idempotency-existing',
      presetId: null,
      sourceFingerprint: 'fingerprint-existing',
      requestFingerprint: 'request-fingerprint-existing',
      status: 'committed',
      rowCount: 1,
      createdRecordCount: 1,
      duplicateCount: 0,
      errorCount: 0,
      createdRecords: [
        {
          kind: 'cashflow',
          id: 'expense-existing',
          rowIndex: 1,
          dedupeKey: 'cashflow|2026-05-01|2500.000000|eur|stipendio',
          amount: 2500,
          currency: 'EUR',
          type: 'income',
          categoryId: 'income-salary',
          categoryName: 'Stipendio',
          subCategoryId: null,
          subCategoryName: null,
        },
      ],
      createdAt: new Date('2026-06-03T09:00:00.000Z'),
      committedAt: new Date('2026-06-03T09:01:00.000Z'),
      rolledBackAt: null,
      rollbackReason: null,
    };

    const { service } = createStubbedCashflowCommitService({
      repository: createBatchRepository([committedBatch]),
      categoryRepository: createCategoryRepository([
        {
          id: 'income-salary',
          userId: 'user-1',
          name: 'Stipendio',
          type: 'income',
          subCategories: [],
        },
      ]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-2', 'expense-2'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    await expect(
      service.commitBatch('user-1', {
        idempotencyKey: 'idempotency-2',
        rows: [
          createCashflowRow(),
        ],
      })
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it('blocks conservative duplicates already present in manual cashflow expenses', async () => {
    const repository = createBatchRepository([], [
      createExpenseRecord({
        id: 'expense-manual-duplicate',
        batchId: 'manual-batch-duplicate',
        dedupeKey: 'manual|2026-05-01|2500.000000|eur|stipendio',
        categoryId: 'income-bonus',
        categoryName: 'Bonus',
        date: new Date('2026-05-01T08:30:00.000Z'),
        notes: 'Stipendio',
        importBatchId: 'manual-batch-duplicate',
        importIdempotencyKey: 'manual-idempotency-duplicate',
        createdAt: new Date('2026-05-01T08:30:00.000Z'),
        updatedAt: new Date('2026-05-01T08:30:00.000Z'),
      }),
    ]);
    const { service } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([
        {
          id: 'income-salary',
          userId: 'user-1',
          name: 'Stipendio',
          type: 'income',
          subCategories: [],
        },
      ]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-2', 'expense-2'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    await expect(
      service.commitBatch('user-1', {
        idempotencyKey: 'idempotency-2',
        rows: [
          createCashflowRow(),
        ],
      })
    ).rejects.toMatchObject({
      status: 409,
    });

    expect(repository.getExpenseCount()).toBe(1);
  });

  it('rolls back a committed batch when imported rows were not manually edited', async () => {
    const repository = createBatchRepository();
    const {
      service,
      invalidateDashboardOverviewSummaryServerMock,
    } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([
        {
          id: 'income-salary',
          userId: 'user-1',
          name: 'Stipendio',
          type: 'income',
          subCategories: [],
        },
      ]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'expense-1'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    const committed = await service.commitBatch('user-1', {
      idempotencyKey: 'idempotency-1',
      rows: [createCashflowRow()],
    });

    const rollback = await service.rollbackBatch('user-1', committed.batch.id, 'annullamento manuale');

    expect(rollback).toMatchObject({
      batch: {
        id: committed.batch.id,
        status: 'rolledBack',
        rollbackReason: 'annullamento manuale',
      },
      removedRecordCount: 1,
    });
    expect(repository.getExpenseCount()).toBe(0);
    expect(invalidateDashboardOverviewSummaryServerMock).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'csv_import_cashflow_committed'
    );
    expect(invalidateDashboardOverviewSummaryServerMock).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'csv_import_cashflow_rolled_back'
    );
  });

  it('blocks rollback when imported records were manually edited after commit', async () => {
    const repository = createBatchRepository();
    const { service } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([
        {
          id: 'income-salary',
          userId: 'user-1',
          name: 'Stipendio',
          type: 'income',
          subCategories: [],
        },
      ]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'expense-1'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    const committed = await service.commitBatch('user-1', {
      idempotencyKey: 'idempotency-1',
      rows: [createCashflowRow()],
    });

    repository.mutateExpense('expense-1', {
      updatedAt: new Date('2026-06-03T11:00:00.000Z'),
    });

    await expect(
      service.rollbackBatch('user-1', committed.batch.id, 'rollback non sicuro')
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

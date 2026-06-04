import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  createCsvImportCashflowCommitService,
} from '@/lib/server/imports/cashflowCommitService';
import type {
  CsvImportCashflowBatchRepository,
  CsvImportCashflowAssetRecord,
  CsvImportCashflowAssetReference,
  CsvImportCashflowCreatedRecord,
  CsvImportCashflowExpenseRecord,
  CsvImportCashflowInternalTransferRecord,
  CsvImportCashflowInvestmentOperationRecord,
} from '@/lib/server/imports/cashflowCommitTypes';
import type { InvestmentOperationType } from '@/types/investments';

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
interface MockAssetRecord extends CsvImportCashflowAssetRecord {
  averageCost?: number;
  ticker?: string;
  isin?: string;
}

interface MockInvestmentOperationCreatedRecord {
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
  netCashEffect: number;
}

interface MockInvestmentOperationRecord extends CsvImportCashflowInvestmentOperationRecord {
  kind: 'investmentOperation';
  userId: string;
  batchId: string;
  date: Date;
  previousQuantity: number;
  previousAverageCost?: number;
  realizedGain?: number;
  realizedGainTax?: number;
  importBatchId: string;
  importIdempotencyKey: string;
  importSourceFingerprint: string | null;
  importPresetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
type CommitServiceDependencies = Parameters<typeof createCsvImportCashflowCommitService>[0];

type MockBatchRepository = CsvImportCashflowBatchRepository & {
  getExpenseById(expenseId: string): MockCommittedRecord | null;
  mutateExpense(expenseId: string, patch: Partial<MockCommittedRecord>): void;
  getExpenseCount(): number;
  getTransferCount(): number;
  getTransferById(transferId: string): MockInternalTransferRecord | null;
  getInvestmentOperationById(operationId: string): CsvImportCashflowInvestmentOperationRecord | null;
  getInvestmentOperationCount(): number;
  mutateTransfer(transferId: string, patch: Partial<MockInternalTransferRecord>): void;
  mutateInvestmentOperation(
    operationId: string,
    patch: Partial<CsvImportCashflowInvestmentOperationRecord>
  ): void;
  peekAssetById(assetId: string): MockAssetRecord | null;
  getBatchCount(): number;
};

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

function normalizeReferenceText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function createBatchRepository(
  initialBatches: MockBatch[] = [],
  initialExpenses: MockCommittedRecord[] = [],
  initialTransfers: MockInternalTransferRecord[] = [],
  initialAssets: MockAssetRecord[] = [],
  initialInvestmentOperations: MockInvestmentOperationRecord[] = []
): MockBatchRepository {
  const batches = new Map(initialBatches.map((batch) => [batch.id, batch]));
  const expenses = new Map(initialExpenses.map((expense) => [expense.id, expense]));
  const transfers = new Map(initialTransfers.map((transfer) => [transfer.id, transfer]));
  const assets = new Map(initialAssets.map((asset) => [asset.id, asset]));
  const investmentOperations = new Map<string, CsvImportCashflowInvestmentOperationRecord>(
    initialInvestmentOperations.map((operation) => [operation.id, operation])
  );

  function updateAssetRecord(
    assetId: string,
    patch: Partial<MockAssetRecord>
  ): void {
    const current = assets.get(assetId);
    if (!current) {
      return;
    }

    assets.set(assetId, {
      ...current,
      ...patch,
    });
  }

  function applyTransferRecord(record: MockInternalTransferRecord): void {
    updateAssetRecord(record.fromCashAssetId, {
      quantity: (assets.get(record.fromCashAssetId)?.quantity ?? 0) - record.amount - record.fees,
      updatedAt: record.updatedAt,
    });
    updateAssetRecord(record.toCashAssetId, {
      quantity: (assets.get(record.toCashAssetId)?.quantity ?? 0) + record.amount,
      updatedAt: record.updatedAt,
    });
  }

  function applyInvestmentOperationRecord(operation: CsvImportCashflowInvestmentOperationRecord): void {
    investmentOperations.set(operation.id, operation);

    updateAssetRecord(operation.assetId, {
      quantity: (assets.get(operation.assetId)?.quantity ?? 0)
        + (operation.resultingQuantity - operation.previousQuantity),
      averageCost: operation.resultingAverageCost,
      updatedAt: operation.updatedAt,
    });

    if (operation.cashAssetId && Math.abs(operation.netCashEffect) > 0.000001) {
      updateAssetRecord(operation.cashAssetId, {
        quantity: (assets.get(operation.cashAssetId)?.quantity ?? 0) + operation.netCashEffect,
        updatedAt: operation.updatedAt,
      });
    }
  }

  function reverseTransferRecord(record: MockInternalTransferRecord, rolledBackAt: Date): void {
    updateAssetRecord(record.fromCashAssetId, {
      quantity: (assets.get(record.fromCashAssetId)?.quantity ?? 0) + record.amount + record.fees,
      updatedAt: rolledBackAt,
    });
    updateAssetRecord(record.toCashAssetId, {
      quantity: (assets.get(record.toCashAssetId)?.quantity ?? 0) - record.amount,
      updatedAt: rolledBackAt,
    });
  }

  function reverseInvestmentOperationRecord(
    operation: CsvImportCashflowInvestmentOperationRecord,
    rolledBackAt: Date
  ): void {
    updateAssetRecord(operation.assetId, {
      quantity: (assets.get(operation.assetId)?.quantity ?? 0)
        + (operation.previousQuantity - operation.resultingQuantity),
      averageCost: operation.previousAverageCost,
      updatedAt: rolledBackAt,
    });

    if (operation.cashAssetId && Math.abs(operation.netCashEffect) > 0.000001) {
      updateAssetRecord(operation.cashAssetId, {
        quantity: (assets.get(operation.cashAssetId)?.quantity ?? 0) - operation.netCashEffect,
        updatedAt: rolledBackAt,
      });
    }
  }

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
    async getAssetById(assetId: string) {
      return assets.get(assetId) ?? null;
    },
    async getInvestmentAssetByConfirmedReference(
      userId: string,
      reference: CsvImportCashflowAssetReference
    ) {
      const targetTicker = normalizeReferenceText(reference.assetTicker);
      const targetIsin = normalizeReferenceText(reference.assetIsin);
      const targetName = normalizeReferenceText(reference.assetName);

      return Array.from(assets.values()).find((asset) => {
        if (asset.userId !== userId || asset.assetClass === 'cash') {
          return false;
        }

        const assetTicker = normalizeReferenceText(asset.ticker);
        const assetIsin = normalizeReferenceText(asset.isin);
        const assetName = normalizeReferenceText(asset.name);

        return (
          (!targetTicker || assetTicker === targetTicker) &&
          (!targetIsin || assetIsin === targetIsin) &&
          (!targetName || assetName === targetName)
        );
      }) ?? null;
    },
    async commitBatch(
      batch: MockBatch,
      createdRecords: CsvImportCashflowCreatedRecord[],
      createdExpenses: MockCommittedRecord[] = [],
      createdTransfers: MockInternalTransferRecord[] = [],
      createdInvestmentOperations: CsvImportCashflowInvestmentOperationRecord[] = []
    ) {
      batches.set(batch.id, batch);
      createdExpenses.forEach((record) => {
        expenses.set(record.id, record);
      });
      createdTransfers.forEach((record) => {
        transfers.set(record.id, record);
        applyTransferRecord(record);
      });
      createdInvestmentOperations.forEach((record) => {
        applyInvestmentOperationRecord(record);
      });
    },
    async listExpensesByBatchId(batchId: string) {
      return Array.from(expenses.values()).filter((expense) => expense.importBatchId === batchId);
    },
    async listInternalTransfersByBatchId(batchId: string) {
      return Array.from(transfers.values()).filter((transfer) => transfer.importBatchId === batchId);
    },
    async listInvestmentOperationsByBatchId(batchId: string) {
      return Array.from(investmentOperations.values())
        .filter((operation) => operation.importBatchId === batchId)
        .sort((left, right) => left.rowIndex - right.rowIndex);
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
      investmentOperationIds: string[],
      rolledBackAt: Date,
      rollbackReason: string
    ) {
      expenseIds.forEach((expenseId) => {
        expenses.delete(expenseId);
      });
      transferIds.forEach((transferId) => {
        const transfer = transfers.get(transferId);
        if (!transfer) return;
        reverseTransferRecord(transfer, rolledBackAt);
        transfers.delete(transferId);
      });
      investmentOperationIds
        .map((operationId) => investmentOperations.get(operationId))
        .filter((operation): operation is CsvImportCashflowInvestmentOperationRecord => Boolean(operation))
        .sort((left, right) => left.rowIndex - right.rowIndex)
        .reverse()
        .forEach((operation) => {
          reverseInvestmentOperationRecord(operation, rolledBackAt);
          investmentOperations.delete(operation.id);
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
    getInvestmentOperationById(operationId: string) {
      return investmentOperations.get(operationId) ?? null;
    },
    getInvestmentOperationCount() {
      return investmentOperations.size;
    },
    mutateTransfer(transferId: string, patch: Partial<MockInternalTransferRecord>) {
      const current = transfers.get(transferId);
      if (!current) return;
      transfers.set(transferId, { ...current, ...patch });
    },
    mutateInvestmentOperation(operationId: string, patch: Partial<CsvImportCashflowInvestmentOperationRecord>) {
      const current = investmentOperations.get(operationId);
      if (!current) return;
      investmentOperations.set(operationId, { ...current, ...patch });
    },
    peekAssetById(assetId: string) {
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

function createInvestmentAsset(overrides: Partial<MockAssetRecord> = {}): MockAssetRecord {
  return {
    id: 'equity-1',
    userId: 'user-1',
    name: 'Vanguard FTSE All-World UCITS ETF',
    ticker: 'VWCE',
    isin: 'IE00B3RBWM25',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    averageCost: 100,
    updatedAt: new Date('2026-06-01T10:00:00.000Z'),
    ...overrides,
  };
}

function createInvestmentOperationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rowIndex: 1,
    movementKind: 'investmentOperation' as const,
    ready: true,
    issues: [],
    dedupeKey: 'investmentOperation|2026-05-05|-605.000000|eur|acquisto vwce|ie00b3rbwm25|vwce|5.000000|120.000000|3.000000|2.000000',
    dedupeStatus: 'unique' as const,
    canonicalFields: {
      date: '2026-05-05',
      description: 'Acquisto VWCE',
      amount: -605,
      currency: 'EUR',
      sourceType: null,
      sourceAccount: 'cash-1',
      destinationAccount: null,
      assetTicker: 'VWCE',
      assetIsin: 'IE00B3RBWM25',
      assetName: 'Vanguard FTSE All-World UCITS ETF',
      quantity: 5,
      unitPrice: 120,
      fees: 3,
      taxes: 2,
    },
    categoryId: null,
    categoryName: null,
    subCategoryId: null,
    subCategoryName: null,
    ...overrides,
  };
}

function createInvestmentOperationCreatedRecord(
  overrides: Partial<MockInvestmentOperationCreatedRecord> = {}
): MockInvestmentOperationCreatedRecord {
  return {
    kind: 'investmentOperation',
    id: 'operation-1',
    rowIndex: 1,
    dedupeKey: 'investmentOperation|2026-05-05|-605.000000|eur|acquisto vwce|ie00b3rbwm25|vwce|5.000000|120.000000|3.000000|2.000000',
    assetId: 'equity-1',
    assetName: 'Vanguard FTSE All-World UCITS ETF',
    assetTicker: 'VWCE',
    type: 'buy',
    quantity: 5,
    pricePerUnit: 120,
    grossAmount: 600,
    fees: 3,
    taxes: 2,
    currency: 'EUR',
    cashAssetId: 'cash-1',
    cashAssetName: 'Conto liquidita',
    resultingQuantity: 15,
    resultingAverageCost: 107,
    netCashEffect: -605,
    ...overrides,
  };
}

function createInvestmentOperationRecord(
  overrides: Partial<MockInvestmentOperationRecord> = {}
): MockInvestmentOperationRecord {
  return {
    ...createInvestmentOperationCreatedRecord(),
    userId: 'user-1',
    batchId: 'batch-1',
    date: new Date('2026-05-05T10:00:00.000Z'),
    previousQuantity: 10,
    previousAverageCost: 100,
    realizedGain: undefined,
    realizedGainTax: undefined,
    notes: 'Acquisto VWCE',
    importBatchId: 'batch-1',
    importIdempotencyKey: 'idempotency-investment-1',
    importSourceFingerprint: null,
    importPresetId: null,
    createdAt: new Date('2026-05-05T10:00:00.000Z'),
    updatedAt: new Date('2026-05-05T10:00:00.000Z'),
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

  it('commits ready investment operation buy rows with asset cost basis and optional cash debit', async () => {
    const repository = createBatchRepository([], [], [], [
      createCashAsset({
        id: 'cash-1',
        name: 'Conto liquidita',
        quantity: 1000,
      }),
      createInvestmentAsset(),
    ]);
    const {
      service,
    } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
      generateId: (() => {
        const ids = ['batch-1', 'operation-1'];
        return () => ids.shift() ?? 'fallback-id';
      })(),
    });

    const committed = await service.commitBatch('user-1', {
      idempotencyKey: 'idempotency-investment-1',
      rows: [createInvestmentOperationRow()],
    });

    expect(committed).toMatchObject({
      batch: {
        id: 'batch-1',
        userId: 'user-1',
        idempotencyKey: 'idempotency-investment-1',
        status: 'committed',
        rowCount: 1,
        createdRecordCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        createdRecords: [
          expect.objectContaining({
            kind: 'investmentOperation',
            id: 'operation-1',
            rowIndex: 1,
            dedupeKey: 'investmentOperation|2026-05-05|-605.000000|eur|acquisto vwce|ie00b3rbwm25|vwce|5.000000|120.000000|3.000000|2.000000',
            assetId: 'equity-1',
            assetName: 'Vanguard FTSE All-World UCITS ETF',
            assetTicker: 'VWCE',
            type: 'buy',
            quantity: 5,
            pricePerUnit: 120,
            grossAmount: 600,
            fees: 3,
            taxes: 2,
            currency: 'EUR',
            cashAssetId: 'cash-1',
            cashAssetName: 'Conto liquidita',
            resultingQuantity: 15,
            resultingAverageCost: 107,
            netCashEffect: -605,
          }),
        ],
      },
      createdRecordCount: 1,
      wasIdempotent: false,
    });
    expect(repository.getExpenseCount()).toBe(0);
    expect(repository.getInvestmentOperationCount()).toBe(1);
    expect(repository.peekAssetById('equity-1')?.quantity).toBe(15);
    expect(repository.peekAssetById('equity-1')?.averageCost).toBe(107);
    expect(repository.peekAssetById('cash-1')?.quantity).toBe(395);
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
    expect(repository.peekAssetById('cash-source')?.quantity).toBe(598);
    expect(repository.peekAssetById('cash-destination')?.quantity).toBe(500);

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
    expect(repository.peekAssetById('cash-source')?.quantity).toBe(1000);
    expect(repository.peekAssetById('cash-destination')?.quantity).toBe(100);
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

  it('rolls back imported investment operations when the position is still safe to undo', async () => {
    const committedBatch: MockBatch = {
      id: 'batch-1',
      userId: 'user-1',
      idempotencyKey: 'idempotency-investment-1',
      presetId: null,
      sourceFingerprint: null,
      requestFingerprint: 'request-fingerprint-investment-1',
      status: 'committed',
      rowCount: 1,
      createdRecordCount: 1,
      duplicateCount: 0,
      errorCount: 0,
      createdRecords: [
        createInvestmentOperationCreatedRecord() as unknown as CsvImportCashflowCreatedRecord,
      ],
      createdAt: new Date('2026-06-03T09:00:00.000Z'),
      committedAt: new Date('2026-06-03T09:01:00.000Z'),
      rolledBackAt: null,
      rollbackReason: null,
    };
    const repository = createBatchRepository([committedBatch], [], [], [
      createCashAsset({
        id: 'cash-1',
        name: 'Conto liquidita',
        quantity: 395,
      }),
      createInvestmentAsset({
        quantity: 15,
        averageCost: 107,
      }),
    ], [
      createInvestmentOperationRecord({
        id: 'operation-1',
        batchId: 'batch-1',
        importBatchId: 'batch-1',
        importIdempotencyKey: 'idempotency-investment-1',
        cashAssetId: 'cash-1',
        cashAssetName: 'Conto liquidita',
      }),
    ]);
    const { service } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
    });

    const rollback = await service.rollbackBatch('user-1', 'batch-1', 'annullamento investimento');

    expect(rollback).toMatchObject({
      batch: {
        id: 'batch-1',
        status: 'rolledBack',
        rollbackReason: 'annullamento investimento',
      },
      removedRecordCount: 1,
    });
    expect(repository.getInvestmentOperationById('operation-1')).toBeNull();
    expect(repository.getInvestmentOperationCount()).toBe(0);
    expect(repository.peekAssetById('equity-1')?.quantity).toBe(10);
    expect(repository.peekAssetById('equity-1')?.averageCost).toBe(100);
    expect(repository.peekAssetById('cash-1')?.quantity).toBe(1000);
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

  it('rejects rollback when an investment asset quantity no longer matches the recorded post-operation quantity', async () => {
    const committedBatch: MockBatch = {
      id: 'batch-1',
      userId: 'user-1',
      idempotencyKey: 'idempotency-investment-unsafe',
      presetId: null,
      sourceFingerprint: null,
      requestFingerprint: 'request-fingerprint-investment-unsafe',
      status: 'committed',
      rowCount: 1,
      createdRecordCount: 1,
      duplicateCount: 0,
      errorCount: 0,
      createdRecords: [
        createInvestmentOperationCreatedRecord({
          id: 'operation-1',
          resultingQuantity: 15,
        }) as unknown as CsvImportCashflowCreatedRecord,
      ],
      createdAt: new Date('2026-06-03T09:00:00.000Z'),
      committedAt: new Date('2026-06-03T09:01:00.000Z'),
      rolledBackAt: null,
      rollbackReason: null,
    };
    const repository = createBatchRepository([committedBatch], [], [], [
      createCashAsset({
        id: 'cash-1',
        name: 'Conto liquidita',
        quantity: 395,
      }),
      createInvestmentAsset({
        quantity: 16,
        averageCost: 107,
      }),
    ], [
      createInvestmentOperationRecord({
        id: 'operation-1',
        batchId: 'batch-1',
        importBatchId: 'batch-1',
        importIdempotencyKey: 'idempotency-investment-unsafe',
        cashAssetId: 'cash-1',
        cashAssetName: 'Conto liquidita',
        resultingQuantity: 15,
      }),
    ]);
    const { service } = createStubbedCashflowCommitService({
      repository,
      categoryRepository: createCategoryRepository([]),
      now: () => new Date('2026-06-03T10:00:00.000Z'),
    });

    await expect(
      service.rollbackBatch('user-1', 'batch-1', 'annullamento non sicuro')
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

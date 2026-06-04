import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  verifyIdTokenMock,
  commitCsvImportCashflowBatchMock,
  rollbackCsvImportCashflowBatchMock,
  listCsvImportCashflowBatchesMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  commitCsvImportCashflowBatchMock: vi.fn(),
  rollbackCsvImportCashflowBatchMock: vi.fn(),
  listCsvImportCashflowBatchesMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
}));

vi.mock('@/lib/server/imports/cashflowCommitService', () => {
  class CsvImportCashflowCommitServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'CsvImportCashflowCommitServiceError';
    }
  }

  return {
    CsvImportCashflowCommitServiceError,
    isCsvImportCashflowCommitServiceError: (error: unknown) => error instanceof CsvImportCashflowCommitServiceError,
    commitCsvImportCashflowBatch: commitCsvImportCashflowBatchMock,
    rollbackCsvImportCashflowBatch: rollbackCsvImportCashflowBatchMock,
    listCsvImportCashflowBatches: listCsvImportCashflowBatchesMock,
  };
});

import { POST as commitRoute } from '@/app/api/imports/commit/route';
import { POST as rollbackRoute } from '@/app/api/imports/[batchId]/rollback/route';
import { GET as historyRoute } from '@/app/api/imports/history/route';

function createJsonRequest(
  url: string,
  {
    method = 'POST',
    body,
    headers,
  }: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('CSV import cashflow commit routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    commitCsvImportCashflowBatchMock.mockResolvedValue({
      batch: {
        id: 'batch-1',
        status: 'committed',
      },
      createdRecordCount: 1,
      wasIdempotent: false,
    });
    rollbackCsvImportCashflowBatchMock.mockResolvedValue({
      batch: {
        id: 'batch-1',
        status: 'rolledBack',
      },
      removedRecordCount: 1,
    });
    listCsvImportCashflowBatchesMock.mockResolvedValue([
      {
        id: 'batch-1',
        userId: 'user-1',
        idempotencyKey: 'idempotency-1',
        presetId: 'preset-1',
        sourceFingerprint: 'fingerprint-1',
        requestFingerprint: 'request-fingerprint-1',
        status: 'committed',
        rowCount: 2,
        createdRecordCount: 2,
        duplicateCount: 0,
        errorCount: 0,
        createdRecords: [],
        createdAt: '2026-06-03T09:00:00.000Z',
        committedAt: '2026-06-03T09:01:00.000Z',
        rolledBackAt: null,
        rollbackReason: null,
      },
    ]);
  });

  it('returns 401 on commit without bearer token', async () => {
    const response = await commitRoute(createJsonRequest('http://localhost/api/imports/commit'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(commitCsvImportCashflowBatchMock).not.toHaveBeenCalled();
  });

  it('returns 400 when commit payload is invalid', async () => {
    const response = await commitRoute(
      createJsonRequest('http://localhost/api/imports/commit', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          idempotencyKey: '',
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Payload non valido',
    });
    expect(commitCsvImportCashflowBatchMock).not.toHaveBeenCalled();
  });

  it('returns 403 when commit payload userId mismatches authenticated token', async () => {
    const response = await commitRoute(
      createJsonRequest('http://localhost/api/imports/commit', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-2',
          idempotencyKey: 'idempotency-1',
          rows: [
            {
              rowIndex: 1,
              movementKind: 'cashflow',
              ready: true,
              dedupeKey: 'cashflow|2026-05-01|2500.000000|eur|stipendio',
              dedupeStatus: 'unique',
              issues: [],
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
            },
          ],
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Authenticated user does not match requested user',
    });
    expect(commitCsvImportCashflowBatchMock).not.toHaveBeenCalled();
  });

  it('creates a cashflow import batch for authenticated users', async () => {
    const payload = {
      userId: 'user-1',
      presetId: 'preset-1',
      sourceFingerprint: 'fingerprint-1',
      idempotencyKey: 'idempotency-1',
      rows: [
        {
          rowIndex: 1,
          movementKind: 'cashflow',
          ready: true,
          dedupeKey: 'cashflow|2026-05-01|2500.000000|eur|stipendio',
          dedupeStatus: 'unique',
          issues: [],
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
        },
      ],
    };

    const response = await commitRoute(
      createJsonRequest('http://localhost/api/imports/commit', {
        body: payload,
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        batch: {
          id: 'batch-1',
        },
        createdRecordCount: 1,
        wasIdempotent: false,
      },
    });
    expect(commitCsvImportCashflowBatchMock).toHaveBeenCalledWith('user-1', payload);
  });

  it('accepts transfer rows without cashflow category references', async () => {
    const payload = {
      userId: 'user-1',
      idempotencyKey: 'idempotency-transfer-1',
      rows: [
        {
          rowIndex: 1,
          movementKind: 'transfer',
          ready: true,
          dedupeKey: 'transfer|2026-05-03|400.000000|eur|giroconto',
          dedupeStatus: 'unique',
          issues: [],
          canonicalFields: {
            date: '2026-05-03',
            description: 'Giroconto',
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
        },
      ],
    };

    const response = await commitRoute(
      createJsonRequest('http://localhost/api/imports/commit', {
        body: payload,
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(201);
    expect(commitCsvImportCashflowBatchMock).toHaveBeenCalledWith('user-1', payload);
  });

  it('accepts dividend rows and standalone fee/tax rows with dividend-specific canonical fields', async () => {
    const payload = {
      userId: 'user-1',
      presetId: 'preset-1',
      sourceFingerprint: 'fingerprint-dividend-1',
      idempotencyKey: 'idempotency-dividend-1',
      rows: [
        {
          rowIndex: 1,
          movementKind: 'dividend',
          ready: true,
          dedupeKey: 'dividend|2026-05-10|74.000000|eur|cedola btp|it0000000001|btp|100.000000|74.000000|coupon',
          dedupeStatus: 'unique',
          issues: [],
          canonicalFields: {
            date: '2026-05-10',
            paymentDate: '2026-05-10',
            exDate: '2026-05-08',
            description: 'Cedola BTP',
            amount: 74,
            grossAmount: 100,
            taxAmount: 26,
            netAmount: 74,
            currency: 'EUR',
            sourceType: 'coupon',
            sourceAccount: null,
            destinationAccount: null,
            assetTicker: 'BTP',
            assetIsin: 'IT0000000001',
            assetName: 'BTP 5%',
            quantity: 10,
            unitPrice: null,
            fees: null,
            taxes: 26,
            dividendType: 'coupon',
            linkedMovementReference: null,
          },
          categoryId: null,
          categoryName: null,
          subCategoryId: null,
          subCategoryName: null,
        },
        {
          rowIndex: 2,
          movementKind: 'fee',
          ready: true,
          dedupeKey: 'fee|2026-05-11|-12.500000|eur|commissioni broker',
          dedupeStatus: 'unique',
          issues: [],
          canonicalFields: {
            date: '2026-05-11',
            description: 'Commissioni broker',
            amount: -12.5,
            currency: 'EUR',
            sourceType: 'fee',
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
          categoryId: 'expense-investment-fees',
          categoryName: 'Commissioni investimento',
          subCategoryId: null,
          subCategoryName: null,
        },
        {
          rowIndex: 3,
          movementKind: 'tax',
          ready: true,
          dedupeKey: 'tax|2026-05-12|-26.000000|eur|imposte broker',
          dedupeStatus: 'unique',
          issues: [],
          canonicalFields: {
            date: '2026-05-12',
            description: 'Imposte broker',
            amount: -26,
            currency: 'EUR',
            sourceType: 'tax',
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
          categoryId: 'expense-investment-fees',
          categoryName: 'Commissioni investimento',
          subCategoryId: null,
          subCategoryName: null,
        },
      ],
    };

    const response = await commitRoute(
      createJsonRequest('http://localhost/api/imports/commit', {
        body: payload,
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(201);
    expect(commitCsvImportCashflowBatchMock).toHaveBeenCalledWith('user-1', payload);
  });

  it('rolls back a committed batch for authenticated users', async () => {
    const response = await rollbackRoute(
      createJsonRequest('http://localhost/api/imports/batch-1/rollback', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ batchId: 'batch-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        batch: {
          id: 'batch-1',
          status: 'rolledBack',
        },
        removedRecordCount: 1,
      },
    });
    expect(rollbackCsvImportCashflowBatchMock).toHaveBeenCalledWith('user-1', 'batch-1');
  });

  it('returns 403 when rollback service rejects ownership mismatch', async () => {
    const { CsvImportCashflowCommitServiceError } = await import('@/lib/server/imports/cashflowCommitService');
    rollbackCsvImportCashflowBatchMock.mockRejectedValueOnce(
      new CsvImportCashflowCommitServiceError(403, 'Resource does not belong to authenticated user')
    );

    const response = await rollbackRoute(
      createJsonRequest('http://localhost/api/imports/batch-2/rollback', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ batchId: 'batch-2' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Resource does not belong to authenticated user',
    });
  });

  it('returns 401 on history without bearer token', async () => {
    const response = await historyRoute(createJsonRequest('http://localhost/api/imports/history'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(listCsvImportCashflowBatchesMock).not.toHaveBeenCalled();
  });

  it('returns the authenticated import history with committed and rolledBack batch metadata', async () => {
    const history = [
      {
        id: 'batch-1',
        userId: 'user-1',
        idempotencyKey: 'idempotency-1',
        presetId: 'preset-1',
        sourceFingerprint: 'fingerprint-1',
        requestFingerprint: 'request-fingerprint-1',
        status: 'committed',
        rowCount: 2,
        createdRecordCount: 2,
        duplicateCount: 0,
        errorCount: 1,
        createdRecords: [
          {
            kind: 'cashflow',
            id: 'expense-1',
            rowIndex: 1,
            dedupeKey: 'cashflow|2026-06-01|10.000000|eur|test',
            amount: 10,
            currency: 'EUR',
            type: 'income',
            categoryId: 'income-salary',
            categoryName: 'Stipendio',
            subCategoryId: null,
            subCategoryName: null,
          },
        ],
        createdAt: '2026-06-03T09:00:00.000Z',
        committedAt: '2026-06-03T09:01:00.000Z',
        rolledBackAt: null,
        rollbackReason: null,
      },
      {
        id: 'batch-2',
        userId: 'user-1',
        idempotencyKey: 'idempotency-2',
        presetId: null,
        sourceFingerprint: null,
        requestFingerprint: 'request-fingerprint-2',
        status: 'rolledBack',
        rowCount: 1,
        createdRecordCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        createdRecords: [],
        createdAt: '2026-06-02T09:00:00.000Z',
        committedAt: '2026-06-02T09:01:00.000Z',
        rolledBackAt: '2026-06-02T09:15:00.000Z',
        rollbackReason: 'annullamento manuale',
      },
    ];
    listCsvImportCashflowBatchesMock.mockResolvedValueOnce(history);

    const response = await historyRoute(
      createJsonRequest('http://localhost/api/imports/history', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: history,
    });
    expect(listCsvImportCashflowBatchesMock).toHaveBeenCalledWith('user-1');
  });

  it('returns a generic 500 response when history loading fails', async () => {
    listCsvImportCashflowBatchesMock.mockRejectedValueOnce(new Error('history failed'));

    const response = await historyRoute(
      createJsonRequest('http://localhost/api/imports/history', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Errore durante il caricamento dello storico import CSV',
    });
  });
});

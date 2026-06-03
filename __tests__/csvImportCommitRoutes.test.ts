import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  verifyIdTokenMock,
  commitCsvImportCashflowBatchMock,
  rollbackCsvImportCashflowBatchMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  commitCsvImportCashflowBatchMock: vi.fn(),
  rollbackCsvImportCashflowBatchMock: vi.fn(),
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
  };
});

import { POST as commitRoute } from '@/app/api/imports/commit/route';
import { POST as rollbackRoute } from '@/app/api/imports/[batchId]/rollback/route';

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
});

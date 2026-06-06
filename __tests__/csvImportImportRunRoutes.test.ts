import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  verifyIdTokenMock,
  commitCsvImportCashflowBatchMock,
  listCsvImportCashflowBatchesMock,
  listCsvImportCashflowImportRunsMock,
  rollbackCsvImportCashflowImportRunMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  commitCsvImportCashflowBatchMock: vi.fn(),
  listCsvImportCashflowBatchesMock: vi.fn(),
  listCsvImportCashflowImportRunsMock: vi.fn(),
  rollbackCsvImportCashflowImportRunMock: vi.fn(),
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
    listCsvImportCashflowBatches: listCsvImportCashflowBatchesMock,
    listCsvImportCashflowImportRuns: listCsvImportCashflowImportRunsMock,
    rollbackCsvImportCashflowImportRun: rollbackCsvImportCashflowImportRunMock,
  };
});

import { POST as commitRoute } from '@/app/api/imports/commit/route';
import { GET as historyRoute } from '@/app/api/imports/history/route';
import { GET as runsRoute } from '@/app/api/imports/runs/route';
import { POST as rollbackRunRoute } from '@/app/api/imports/runs/[importRunId]/rollback/route';

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

describe('CSV import import run routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    commitCsvImportCashflowBatchMock.mockResolvedValue({
      batch: {
        id: 'batch-1',
        status: 'committed',
        importRunId: 'import-run-1',
        importChunkIndex: 1,
        importChunkCount: 2,
      },
      createdRecordCount: 1,
      wasIdempotent: false,
    });
    rollbackCsvImportCashflowImportRunMock.mockResolvedValue({
      importRunId: 'import-run-1',
      status: 'rolledBack',
      childBatchCount: 2,
      rolledBackChildBatchCount: 2,
      unsafeChildBatchCount: 0,
      removedRecordCount: 4,
      childResults: [
        {
          batchId: 'batch-1',
          status: 'rolledBack',
        },
        {
          batchId: 'batch-2',
          status: 'rolledBack',
        },
      ],
    });
    listCsvImportCashflowBatchesMock.mockResolvedValue([
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
        createdRecords: [
          {
            kind: 'cashflow',
            id: 'expense-2',
            rowIndex: 2,
            dedupeKey: 'cashflow|2026-06-02|20.000000|eur|test',
            amount: 20,
            currency: 'EUR',
            type: 'income',
            categoryId: 'income-salary',
            categoryName: 'Stipendio',
            subCategoryId: null,
            subCategoryName: null,
          },
        ],
        createdAt: '2026-06-03T09:05:00.000Z',
        committedAt: '2026-06-03T09:06:00.000Z',
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
        createdRecords: [],
        createdAt: '2026-06-01T09:00:00.000Z',
        committedAt: '2026-06-01T09:01:00.000Z',
        rolledBackAt: '2026-06-01T09:15:00.000Z',
        rollbackReason: 'annullamento manuale',
      },
    ]);
  });

  it('accepts a stable importRunId across chunked commit requests', async () => {
    const payload = {
      userId: 'user-1',
      presetId: 'preset-1',
      sourceFingerprint: 'fingerprint-1',
      importRunId: 'import-run-1',
      importChunkIndex: 1,
      importChunkCount: 2,
      idempotencyKey: 'idempotency-1::chunk-1',
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
          importRunId: 'import-run-1',
          importChunkIndex: 1,
          importChunkCount: 2,
        },
      },
    });
    expect(commitCsvImportCashflowBatchMock).toHaveBeenCalledWith('user-1', payload);
  });

  it('rolls back a grouped import run with an authenticated bearer token and optional rollback reason', async () => {
    const response = await rollbackRunRoute(
      createJsonRequest('http://localhost/api/imports/runs/import-run-1/rollback', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ importRunId: 'import-run-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        importRunId: 'import-run-1',
        status: 'rolledBack',
        childBatchCount: 2,
        rolledBackChildBatchCount: 2,
        unsafeChildBatchCount: 0,
        removedRecordCount: 4,
        childResults: [
          {
            batchId: 'batch-1',
            status: 'rolledBack',
          },
          {
            batchId: 'batch-2',
            status: 'rolledBack',
          },
        ],
      },
    });
    expect(rollbackCsvImportCashflowImportRunMock).toHaveBeenCalledWith('user-1', 'import-run-1');
  });

  it('forwards the provided rollback reason to grouped rollback', async () => {
    const response = await rollbackRunRoute(
      createJsonRequest('http://localhost/api/imports/runs/import-run-1/rollback', {
        method: 'POST',
        body: {
          rollbackReason: 'annullamento raggruppato',
        },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ importRunId: 'import-run-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        importRunId: 'import-run-1',
        status: 'rolledBack',
      },
    });
    expect(rollbackCsvImportCashflowImportRunMock).toHaveBeenCalledWith(
      'user-1',
      'import-run-1',
      'annullamento raggruppato'
    );
  });

  it('returns 401 on grouped rollback without bearer token', async () => {
    const response = await rollbackRunRoute(
      createJsonRequest('http://localhost/api/imports/runs/import-run-1/rollback', {
        method: 'POST',
      }),
      { params: Promise.resolve({ importRunId: 'import-run-1' }) }
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(rollbackCsvImportCashflowImportRunMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the grouped rollback importRunId is empty', async () => {
    const response = await rollbackRunRoute(
      createJsonRequest('http://localhost/api/imports/runs/%20%20/rollback', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ importRunId: '   ' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Payload non valido',
    });
    expect(rollbackCsvImportCashflowImportRunMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the grouped rollback body is invalid', async () => {
    const response = await rollbackRunRoute(
      createJsonRequest('http://localhost/api/imports/runs/import-run-1/rollback', {
        method: 'POST',
        body: {
          rollbackReason: '   ',
        },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ importRunId: 'import-run-1' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Payload non valido',
      details: {
        fieldErrors: {
          rollbackReason: expect.arrayContaining([expect.any(String)]),
        },
      },
    });
    expect(rollbackCsvImportCashflowImportRunMock).not.toHaveBeenCalled();
  });

  it('returns grouped import runs from GET /api/imports/runs with aggregate counts and child chunk statuses', async () => {
    listCsvImportCashflowImportRunsMock.mockResolvedValueOnce([
      {
        importRunId: 'import-run-1',
        userId: 'user-1',
        status: 'committed',
        childBatchCount: 2,
        committedChildBatchCount: 2,
        rolledBackChildBatchCount: 0,
        rowCount: 370,
        createdRecordCount: 5,
        duplicateCount: 1,
        errorCount: 2,
        createdAt: '2026-06-03T09:00:00.000Z',
        committedAt: '2026-06-03T09:06:00.000Z',
        rolledBackAt: null,
        rollbackReason: null,
        canRollbackGrouped: true,
        childBatches: [
          {
            id: 'batch-1',
            importChunkIndex: 1,
            importChunkCount: 2,
            status: 'committed',
          },
          {
            id: 'batch-2',
            importChunkIndex: 2,
            importChunkCount: 2,
            status: 'committed',
          },
        ],
      },
      {
        importRunId: 'legacy-batch',
        userId: 'user-1',
        status: 'rolledBack',
        childBatchCount: 1,
        committedChildBatchCount: 0,
        rolledBackChildBatchCount: 1,
        rowCount: 15,
        createdRecordCount: 1,
        duplicateCount: 0,
        errorCount: 0,
        createdAt: '2026-06-01T09:00:00.000Z',
        committedAt: '2026-06-01T09:01:00.000Z',
        rolledBackAt: '2026-06-01T09:15:00.000Z',
        rollbackReason: 'annullamento manuale',
        canRollbackGrouped: false,
        childBatches: [
          {
            id: 'legacy-batch',
            importChunkIndex: null,
            importChunkCount: null,
            status: 'rolledBack',
          },
        ],
      },
    ]);

    const response = await runsRoute(
      createJsonRequest('http://localhost/api/imports/runs', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: [
        {
          importRunId: 'import-run-1',
          userId: 'user-1',
          status: 'committed',
          childBatchCount: 2,
          committedChildBatchCount: 2,
          rolledBackChildBatchCount: 0,
          rowCount: 370,
          createdRecordCount: 5,
          duplicateCount: 1,
          errorCount: 2,
          createdAt: '2026-06-03T09:00:00.000Z',
          committedAt: '2026-06-03T09:06:00.000Z',
          rolledBackAt: null,
          rollbackReason: null,
          canRollbackGrouped: true,
          childBatches: [
            {
              id: 'batch-1',
              importChunkIndex: 1,
              importChunkCount: 2,
              status: 'committed',
            },
            {
              id: 'batch-2',
              importChunkIndex: 2,
              importChunkCount: 2,
              status: 'committed',
            },
          ],
        },
        {
          importRunId: 'legacy-batch',
          userId: 'user-1',
          status: 'rolledBack',
          childBatchCount: 1,
          committedChildBatchCount: 0,
          rolledBackChildBatchCount: 1,
          rowCount: 15,
          createdRecordCount: 1,
          duplicateCount: 0,
          errorCount: 0,
          createdAt: '2026-06-01T09:00:00.000Z',
          committedAt: '2026-06-01T09:01:00.000Z',
          rolledBackAt: '2026-06-01T09:15:00.000Z',
          rollbackReason: 'annullamento manuale',
          canRollbackGrouped: false,
          childBatches: [
            {
              id: 'legacy-batch',
              importChunkIndex: null,
              importChunkCount: null,
              status: 'rolledBack',
            },
          ],
        },
      ],
    });
    expect(listCsvImportCashflowImportRunsMock).toHaveBeenCalledWith('user-1');
  });

  it('returns grouped import runs from legacy GET /api/imports/history with aggregate counts and child chunk statuses', async () => {
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
      data: [
        {
          importRunId: 'import-run-1',
          userId: 'user-1',
          childBatchCount: 2,
          committedChildBatchCount: 2,
          rolledBackChildBatchCount: 0,
          rowCount: 370,
          createdRecordCount: 5,
          duplicateCount: 1,
          errorCount: 2,
          status: 'committed',
          canRollbackGrouped: true,
          childBatches: [
            expect.objectContaining({
              id: 'batch-1',
              importChunkIndex: 1,
              importChunkCount: 2,
              status: 'committed',
            }),
            expect.objectContaining({
              id: 'batch-2',
              importChunkIndex: 2,
              importChunkCount: 2,
              status: 'committed',
            }),
          ],
        },
        {
          importRunId: 'legacy-batch',
          userId: 'user-1',
          childBatchCount: 1,
          committedChildBatchCount: 0,
          rolledBackChildBatchCount: 1,
          rowCount: 15,
          createdRecordCount: 1,
          duplicateCount: 0,
          errorCount: 0,
          status: 'rolledBack',
          canRollbackGrouped: false,
          childBatches: [
            expect.objectContaining({
              id: 'legacy-batch',
              importChunkIndex: null,
              importChunkCount: null,
              status: 'rolledBack',
            }),
          ],
        },
      ],
    });
    expect(listCsvImportCashflowBatchesMock).toHaveBeenCalledWith('user-1');
  });
});

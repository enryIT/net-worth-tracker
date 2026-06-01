import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdTokenMock, buildCsvImportPreviewMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  buildCsvImportPreviewMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
}));

vi.mock('@/lib/server/imports/previewService', () => ({
  buildCsvImportPreview: buildCsvImportPreviewMock,
}));

import { POST as validateRoute } from '@/app/api/imports/validate/route';

function createJsonRequest(
  body: unknown,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest('http://localhost/api/imports/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/imports/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    buildCsvImportPreviewMock.mockReturnValue({
      delimiter: ';',
      hasHeader: true,
      headers: ['Data', 'Descrizione', 'Importo'],
      rows: [],
      summary: {
        totalRows: 0,
        readyRows: 0,
        blockingRows: 0,
        warningRows: 0,
        byKind: {
          cashflow: 0,
          transfer: 0,
          investmentOperation: 0,
          dividend: 0,
          fee: 0,
          tax: 0,
          unknown: 0,
        },
      },
      mappingValidation: {
        blocking: [],
        warnings: [],
      },
    });
  });

  it('returns 401 without bearer token', async () => {
    const response = await validateRoute(createJsonRequest({}));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(buildCsvImportPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 403 when request userId does not match authenticated token UID', async () => {
    const response = await validateRoute(
      createJsonRequest(
        {
          userId: 'user-2',
          csvText: 'Data;Descrizione;Importo\n01/05/2026;Stipendio;1000',
          mapping: { date: 'Data', description: 'Descrizione', amount: 'Importo' },
          locale: {
            dateFormats: ['dd/MM/yyyy'],
            decimalSeparator: ',',
            thousandsSeparator: '.',
            defaultCurrency: 'EUR',
          },
        },
        { Authorization: 'Bearer test-token' }
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not match requested user',
    });
    expect(buildCsvImportPreviewMock).not.toHaveBeenCalled();
  });

  it('returns 400 when payload is invalid', async () => {
    const response = await validateRoute(
      createJsonRequest(
        {
          userId: 'user-1',
          mapping: { date: 'Data' },
        },
        { Authorization: 'Bearer test-token' }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Payload non valido',
    });
    expect(buildCsvImportPreviewMock).not.toHaveBeenCalled();
  });

  it('returns preview validation payload for authenticated requests', async () => {
    const response = await validateRoute(
      createJsonRequest(
        {
          userId: 'user-1',
          csvText: 'Data;Descrizione;Importo\n01/05/2026;Stipendio;1000',
          mapping: { date: 'Data', description: 'Descrizione', amount: 'Importo' },
          locale: {
            dateFormats: ['dd/MM/yyyy'],
            decimalSeparator: ',',
            thousandsSeparator: '.',
            defaultCurrency: 'EUR',
          },
        },
        { Authorization: 'Bearer test-token' }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        summary: {
          totalRows: 0,
        },
      },
    });
    expect(buildCsvImportPreviewMock).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when preview service throws', async () => {
    buildCsvImportPreviewMock.mockImplementation(() => {
      throw new Error('boom');
    });

    const response = await validateRoute(
      createJsonRequest(
        {
          userId: 'user-1',
          csvText: 'Data;Descrizione;Importo\n01/05/2026;Stipendio;1000',
          mapping: { date: 'Data', description: 'Descrizione', amount: 'Importo' },
          locale: {
            dateFormats: ['dd/MM/yyyy'],
            decimalSeparator: ',',
            thousandsSeparator: '.',
            defaultCurrency: 'EUR',
          },
        },
        { Authorization: 'Bearer test-token' }
      )
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Errore durante la validazione anteprima import CSV',
    });
  });
});

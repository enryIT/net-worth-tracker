import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  verifyIdTokenMock,
  listCsvImportPresetsMock,
  createCsvImportPresetMock,
  updateCsvImportPresetMock,
  deleteCsvImportPresetMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  listCsvImportPresetsMock: vi.fn(),
  createCsvImportPresetMock: vi.fn(),
  updateCsvImportPresetMock: vi.fn(),
  deleteCsvImportPresetMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
}));

vi.mock('@/lib/server/imports/presetService', () => {
  class CsvImportPresetServiceError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'CsvImportPresetServiceError';
    }
  }

  return {
    CsvImportPresetServiceError,
    isCsvImportPresetServiceError: (error: unknown) => error instanceof CsvImportPresetServiceError,
    listCsvImportPresets: listCsvImportPresetsMock,
    createCsvImportPreset: createCsvImportPresetMock,
    updateCsvImportPreset: updateCsvImportPresetMock,
    deleteCsvImportPreset: deleteCsvImportPresetMock,
  };
});

import { GET as listRoute, POST as createRoute } from '@/app/api/imports/presets/route';
import {
  PATCH as patchRoute,
  PUT as putRoute,
  DELETE as deleteRoute,
} from '@/app/api/imports/presets/[presetId]/route';
import { CsvImportPresetServiceError } from '@/lib/server/imports/presetService';

function createJsonRequest(
  url: string,
  {
    method = 'GET',
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

describe('CSV import preset routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    listCsvImportPresetsMock.mockResolvedValue([]);
    createCsvImportPresetMock.mockResolvedValue({ id: 'preset-1', name: 'Preset 1' });
    updateCsvImportPresetMock.mockResolvedValue({ id: 'preset-1', name: 'Preset aggiornato' });
    deleteCsvImportPresetMock.mockResolvedValue(undefined);
  });

  it('returns 401 on list without Authorization header', async () => {
    const response = await listRoute(createJsonRequest('http://localhost/api/imports/presets'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(listCsvImportPresetsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when Firebase token is invalid', async () => {
    verifyIdTokenMock.mockRejectedValueOnce(new Error('invalid token'));

    const response = await listRoute(
      createJsonRequest('http://localhost/api/imports/presets', {
        headers: {
          Authorization: 'Bearer invalid-token',
        },
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid or expired Firebase ID token',
    });
    expect(listCsvImportPresetsMock).not.toHaveBeenCalled();
  });

  it('lists presets for authenticated user', async () => {
    listCsvImportPresetsMock.mockResolvedValueOnce([
      {
        id: 'preset-1',
        userId: 'user-1',
        name: 'Preset primo conto',
      },
    ]);

    const response = await listRoute(
      createJsonRequest('http://localhost/api/imports/presets', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: [
        {
          id: 'preset-1',
        },
      ],
    });
    expect(listCsvImportPresetsMock).toHaveBeenCalledWith('user-1');
  });

  it('returns 400 when create payload is invalid', async () => {
    const response = await createRoute(
      createJsonRequest('http://localhost/api/imports/presets', {
        method: 'POST',
        body: {
          name: '',
        },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Payload non valido',
    });
    expect(createCsvImportPresetMock).not.toHaveBeenCalled();
  });

  it('rejects create payload containing client-supplied userId field', async () => {
    const response = await createRoute(
      createJsonRequest('http://localhost/api/imports/presets', {
        method: 'POST',
        body: {
          userId: 'user-2',
          name: 'Preset non valido',
          mapping: {
            date: 'Data',
            description: 'Descrizione',
            amount: 'Importo',
          },
          locale: {
            dateFormats: ['dd/MM/yyyy'],
            decimalSeparator: ',',
            thousandsSeparator: '.',
            defaultCurrency: 'EUR',
          },
        },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Payload non valido',
    });
    expect(createCsvImportPresetMock).not.toHaveBeenCalled();
  });

  it('creates preset for authenticated user', async () => {
    const payload = {
      name: 'Preset principale',
      sourceLabel: 'Banca Demo',
      mapping: {
        date: 'Data',
        description: 'Descrizione',
        amount: 'Importo',
      },
      locale: {
        dateFormats: ['dd/MM/yyyy', 'yyyy-MM-dd'],
        decimalSeparator: ',',
        thousandsSeparator: '.',
        defaultCurrency: 'EUR',
      },
    };

    const response = await createRoute(
      createJsonRequest('http://localhost/api/imports/presets', {
        method: 'POST',
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
        id: 'preset-1',
      },
    });
    expect(createCsvImportPresetMock).toHaveBeenCalledWith('user-1', payload);
  });

  it('returns 400 when PUT payload has no updatable fields', async () => {
    const response = await putRoute(
      createJsonRequest('http://localhost/api/imports/presets/preset-1', {
        method: 'PUT',
        body: {},
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ presetId: 'preset-1' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Payload non valido',
    });
    expect(updateCsvImportPresetMock).not.toHaveBeenCalled();
  });

  it('updates preset for authenticated owner', async () => {
    const payload = {
      name: 'Preset aggiornato',
    };

    const response = await patchRoute(
      createJsonRequest('http://localhost/api/imports/presets/preset-1', {
        method: 'PATCH',
        body: payload,
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ presetId: 'preset-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        id: 'preset-1',
      },
    });
    expect(updateCsvImportPresetMock).toHaveBeenCalledWith('user-1', 'preset-1', payload);
  });

  it('returns ownership error when update targets another user preset', async () => {
    updateCsvImportPresetMock.mockRejectedValueOnce(
      new CsvImportPresetServiceError(403, 'Resource does not belong to authenticated user')
    );

    const response = await patchRoute(
      createJsonRequest('http://localhost/api/imports/presets/preset-2', {
        method: 'PATCH',
        body: {
          name: 'Tentativo non autorizzato',
        },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ presetId: 'preset-2' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Resource does not belong to authenticated user',
    });
  });

  it('deletes preset for authenticated owner', async () => {
    const response = await deleteRoute(
      createJsonRequest('http://localhost/api/imports/presets/preset-1', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ presetId: 'preset-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(deleteCsvImportPresetMock).toHaveBeenCalledWith('user-1', 'preset-1');
  });

  it('returns ownership error when deleting another user preset', async () => {
    deleteCsvImportPresetMock.mockRejectedValueOnce(
      new CsvImportPresetServiceError(403, 'Resource does not belong to authenticated user')
    );

    const response = await deleteRoute(
      createJsonRequest('http://localhost/api/imports/presets/preset-2', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ presetId: 'preset-2' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Resource does not belong to authenticated user',
    });
  });
});

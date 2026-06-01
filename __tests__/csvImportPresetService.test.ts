import { describe, expect, it } from 'vitest';
import {
  createCsvImportPresetService,
} from '@/lib/server/imports/presetService';
import type {
  CsvImportPreset,
  CsvImportPresetCreateInput,
  CsvImportPresetRepository,
} from '@/lib/server/imports/presetTypes';

const DEFAULT_CREATE_INPUT: CsvImportPresetCreateInput = {
  name: 'Preset conto principale',
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
  classificationRules: [
    {
      field: 'description',
      operator: 'contains',
      value: 'cedola',
      movementKind: 'dividend',
    },
  ],
};

function createInMemoryRepository(initialPresets: CsvImportPreset[] = []): CsvImportPresetRepository {
  const store = new Map(initialPresets.map((preset) => [preset.id, preset]));

  return {
    async create(preset) {
      store.set(preset.id, preset);
    },
    async listByUserId(userId) {
      return Array.from(store.values()).filter((preset) => preset.userId === userId);
    },
    async getById(presetId) {
      return store.get(presetId) ?? null;
    },
    async update(presetId, patch) {
      const current = store.get(presetId);
      if (!current) {
        return null;
      }

      const updated = {
        ...current,
        ...patch,
      };
      store.set(presetId, updated);
      return updated;
    },
    async delete(presetId) {
      store.delete(presetId);
    },
  };
}

describe('csv import preset service', () => {
  it('creates, lists, updates, and deletes presets in the authenticated user scope', async () => {
    const now = new Date('2026-06-01T10:00:00.000Z');
    let idCounter = 0;
    const service = createCsvImportPresetService({
      repository: createInMemoryRepository(),
      now: () => now,
      generateId: () => {
        idCounter += 1;
        return `preset-${idCounter}`;
      },
    });

    const created = await service.createPreset('user-1', DEFAULT_CREATE_INPUT);

    expect(created).toMatchObject({
      id: 'preset-1',
      userId: 'user-1',
      name: 'Preset conto principale',
      sourceLabel: 'Banca Demo',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastUsedAt: null,
    });

    await service.createPreset('user-2', {
      ...DEFAULT_CREATE_INPUT,
      name: 'Preset altro utente',
    });

    const userPresets = await service.listPresets('user-1');
    expect(userPresets).toHaveLength(1);
    expect(userPresets[0].id).toBe('preset-1');

    const updated = await service.updatePreset('user-1', 'preset-1', {
      name: 'Preset aggiornato',
      sourceLabel: null,
      mapping: {
        date: 'Data operazione',
        description: 'Descrizione',
        amount: 'Importo netto',
      },
    });

    expect(updated.name).toBe('Preset aggiornato');
    expect(updated.sourceLabel).toBeNull();
    expect(updated.mapping.date).toBe('Data operazione');

    await service.deletePreset('user-1', 'preset-1');
    await expect(service.listPresets('user-1')).resolves.toHaveLength(0);
  });

  it('rejects malformed mapping and malformed classification rules', async () => {
    const service = createCsvImportPresetService({
      repository: createInMemoryRepository(),
      now: () => new Date('2026-06-01T10:00:00.000Z'),
      generateId: () => 'preset-x',
    });

    await expect(
      service.createPreset('user-1', {
        ...DEFAULT_CREATE_INPUT,
        mapping: {},
      })
    ).rejects.toMatchObject({
      status: 400,
    });

    await expect(
      service.createPreset('user-1', {
        ...DEFAULT_CREATE_INPUT,
        classificationRules: [
          {
            field: 'description',
            operator: 'invalid-operator',
            value: 'cedola',
            movementKind: 'dividend',
          } as never,
        ],
      })
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('rejects raw CSV content and raw CSV fields in presets', async () => {
    const service = createCsvImportPresetService({
      repository: createInMemoryRepository(),
      now: () => new Date('2026-06-01T10:00:00.000Z'),
      generateId: () => 'preset-raw',
    });

    await expect(
      service.createPreset('user-1', {
        ...DEFAULT_CREATE_INPUT,
        mapping: {
          ...DEFAULT_CREATE_INPUT.mapping,
          description: 'Descrizione\n01/05/2026;Stipendio;2500,00',
        },
      })
    ).rejects.toMatchObject({
      status: 400,
    });

    await expect(
      service.createPreset('user-1', {
        ...DEFAULT_CREATE_INPUT,
        csvText: 'Data;Descrizione;Importo\n01/05/2026;Stipendio;2500,00',
      } as unknown as CsvImportPresetCreateInput)
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('enforces ownership for update and delete', async () => {
    const service = createCsvImportPresetService({
      repository: createInMemoryRepository(),
      now: () => new Date('2026-06-01T10:00:00.000Z'),
      generateId: () => 'preset-1',
    });

    await service.createPreset('user-owner', DEFAULT_CREATE_INPUT);

    await expect(
      service.updatePreset('user-other', 'preset-1', {
        name: 'Tentativo non autorizzato',
      })
    ).rejects.toMatchObject({
      status: 403,
    });

    await expect(service.deletePreset('user-other', 'preset-1')).rejects.toMatchObject({
      status: 403,
    });

    await expect(service.listPresets('user-owner')).resolves.toHaveLength(1);
  });
});

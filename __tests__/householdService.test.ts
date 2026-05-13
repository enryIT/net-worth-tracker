import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HouseholdConfig } from '@/types/household';
import { getDefaultHouseholdConfig } from '@/lib/utils/householdUtils';

const setDocMock = vi.fn();
const addDocMock = vi.fn();

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  collection: vi.fn((_db, name: string) => ({ name })),
  doc: vi.fn((_db, collectionName: string, id: string) => ({ collectionName, id })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: setDocMock,
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1, nanoseconds: 0 })),
  },
  where: vi.fn(),
}));

function findUndefinedPath(value: unknown, path = 'payload'): string | null {
  if (value === undefined) return path;

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const nestedPath = findUndefinedPath(item, `${path}[${index}]`);
      if (nestedPath) return nestedPath;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const nestedPath = findUndefinedPath(item, `${path}.${key}`);
      if (nestedPath) return nestedPath;
    }
  }

  return null;
}

describe('householdService', () => {
  beforeEach(() => {
    setDocMock.mockResolvedValue(undefined);
    addDocMock.mockResolvedValue({ id: 'audit-1' });
  });

  it('removes undefined optional rule fields before saving the household config', async () => {
    const { saveHouseholdConfig } = await import('@/lib/services/householdService');
    const config: HouseholdConfig = {
      ...getDefaultHouseholdConfig('u1'),
      enabled: true,
      attributionRules: [
        {
          id: 'rule-any',
          name: 'Regola generica',
          active: true,
          sortOrder: 0,
          expenseType: undefined,
          categoryId: undefined,
          categoryName: undefined,
          subCategoryId: undefined,
          subCategoryName: undefined,
          linkedCashAssetId: undefined,
          ownershipProfileId: 'self-100',
          ownershipProfileName: 'Io 100%',
          ownershipSplits: [{ participantId: 'self', participantName: 'Io', percentage: 100 }],
        },
      ],
    };

    await saveHouseholdConfig('u1', config);

    const savedPayload = setDocMock.mock.calls[0][1];
    expect(findUndefinedPath(savedPayload)).toBeNull();
    expect(savedPayload.attributionRules[0]).not.toHaveProperty('expenseType');
    expect(savedPayload.attributionRules[0]).not.toHaveProperty('categoryId');
    expect(savedPayload.attributionRules[0]).not.toHaveProperty('linkedCashAssetId');
  });
});

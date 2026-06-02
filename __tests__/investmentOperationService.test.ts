import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateInternalTransferEffect,
  calculateInvestmentOperationEffect,
} from '@/lib/utils/investmentOperationUtils';

const DELETE_FIELD_SENTINEL = '__DELETE_FIELD__';

const firestoreState = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ path: string; payload: Record<string, unknown> }>,
}));

const getDocsMock = vi.hoisted(() => vi.fn());
const runTransactionMock = vi.hoisted(() => vi.fn());
const invalidateDashboardOverviewSummaryMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/config', () => ({
  db: {},
}));

vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: invalidateDashboardOverviewSummaryMock,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, collectionName: string) => ({ __type: 'collection', collectionName })),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => DELETE_FIELD_SENTINEL),
  doc: vi.fn((_db, collectionName: string, id: string) => ({ __type: 'doc', collectionName, id, path: `${collectionName}/${id}` })),
  getDocs: getDocsMock,
  query: vi.fn((collectionRef: { collectionName: string }, ...constraints: Array<{ field: string; op: string; value: unknown }>) => ({
    __type: 'query',
    collectionName: collectionRef.collectionName,
    constraints,
  })),
  runTransaction: runTransactionMock,
  Timestamp: {
    now: vi.fn(() => ({ seconds: 1717200000, nanoseconds: 0 })),
    fromDate: vi.fn((date: Date) => ({ toDate: () => date })),
  },
  updateDoc: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
}));

type MockConstraint = { field: string; op: string; value: unknown };
type MockDocReference = {
  __type: 'doc';
  collectionName: string;
  id: string;
  path: string;
};
type MockQueryReference = {
  __type: 'query';
  collectionName: string;
  constraints: MockConstraint[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMockConstraint(value: unknown): value is MockConstraint {
  return isRecord(value)
    && typeof value.field === 'string'
    && typeof value.op === 'string'
    && 'value' in value;
}

function isMockDocReference(reference: unknown): reference is MockDocReference {
  return isRecord(reference)
    && reference.__type === 'doc'
    && typeof reference.collectionName === 'string'
    && typeof reference.id === 'string'
    && typeof reference.path === 'string';
}

function isMockQueryReference(reference: unknown): reference is MockQueryReference {
  return isRecord(reference)
    && reference.__type === 'query'
    && typeof reference.collectionName === 'string'
    && Array.isArray(reference.constraints)
    && reference.constraints.every(isMockConstraint);
}

function executeQuery(reference: MockQueryReference) {
  return Array.from(firestoreState.docs.entries())
    .filter(([path]) => path.startsWith(`${reference.collectionName}/`))
    .map(([path, data]) => ({
      id: path.split('/')[1],
      data,
    }))
    .filter(({ data }) => reference.constraints.every((constraint) => {
      if (constraint.op !== '==') return false;
      return data[constraint.field] === constraint.value;
    }))
    .map(({ id, data }) => ({ id, data: () => data }));
}

function hasQueryConstraint(
  reference: MockQueryReference,
  field: string,
  value: unknown
): boolean {
  return reference.constraints.some(constraint =>
    constraint.field === field
    && constraint.op === '=='
    && constraint.value === value
  );
}

function seedDoc(path: string, data: Record<string, unknown>) {
  firestoreState.docs.set(path, { ...data });
}

function readDoc(path: string): Record<string, unknown> {
  const doc = firestoreState.docs.get(path);
  if (!doc) {
    throw new Error(`Missing doc ${path}`);
  }
  return doc;
}

function applyUpdate(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === DELETE_FIELD_SENTINEL) {
      delete next[key];
      continue;
    }
    next[key] = value;
  }
  return next;
}

beforeEach(() => {
  vi.clearAllMocks();
  firestoreState.docs.clear();
  firestoreState.updates.length = 0;
  getDocsMock.mockImplementation(async (reference: unknown) => {
    if (!isMockQueryReference(reference)) {
      throw new Error('Unsupported getDocs reference');
    }
    return { docs: executeQuery(reference) };
  });

  runTransactionMock.mockImplementation(async (_db: unknown, callback: (transaction: {
    get: (reference: unknown) => Promise<unknown>;
    update: (reference: { path: string }, patch: Record<string, unknown>) => void;
    set: (reference: { path: string }, payload: Record<string, unknown>) => void;
    delete: (reference: { path: string }) => void;
  }) => Promise<unknown>) => {
    const transaction = {
      get: async (reference: unknown) => {
        if (isMockDocReference(reference)) {
          const docRef = reference;
          const data = firestoreState.docs.get(docRef.path);
          return {
            id: docRef.id,
            exists: () => data !== undefined,
            data: () => data,
          };
        }

        throw new Error('Unsupported transaction.get reference');
      },
      update: (reference: { path: string }, patch: Record<string, unknown>) => {
        const current = firestoreState.docs.get(reference.path);
        if (!current) {
          throw new Error(`Missing doc ${reference.path}`);
        }
        firestoreState.docs.set(reference.path, applyUpdate(current, patch));
        firestoreState.updates.push({ path: reference.path, payload: patch });
      },
      set: (reference: { path: string }, payload: Record<string, unknown>) => {
        firestoreState.docs.set(reference.path, { ...payload });
      },
      delete: (reference: { path: string }) => {
        firestoreState.docs.delete(reference.path);
      },
    };

    return callback(transaction);
  });
});

describe('calculateInvestmentOperationEffect', () => {
  it('updates weighted average cost for buys including fees and taxes', () => {
    const result = calculateInvestmentOperationEffect({
      type: 'buy',
      previousQuantity: 10,
      previousAverageCost: 100,
      quantity: 5,
      pricePerUnit: 120,
      fees: 3,
      taxes: 2,
    });

    expect(result.grossAmount).toBe(600);
    expect(result.resultingQuantity).toBe(15);
    expect(result.resultingAverageCost).toBeCloseTo((1000 + 605) / 15, 6);
    expect(result.netCashEffect).toBe(-605);
    expect(result.realizedGain).toBeUndefined();
  });

  it('keeps average cost unchanged and records realized gain for partial sells', () => {
    const result = calculateInvestmentOperationEffect({
      type: 'sell',
      previousQuantity: 10,
      previousAverageCost: 80,
      quantity: 4,
      pricePerUnit: 100,
      fees: 5,
      taxes: 10,
    });

    expect(result.grossAmount).toBe(400);
    expect(result.resultingQuantity).toBe(6);
    expect(result.resultingAverageCost).toBe(80);
    expect(result.realizedGain).toBe(75);
    expect(result.realizedGainTax).toBe(10);
    expect(result.netCashEffect).toBe(385);
  });

  it('clears average cost when a sell closes the whole position', () => {
    const result = calculateInvestmentOperationEffect({
      type: 'sell',
      previousQuantity: 3,
      previousAverageCost: 50,
      quantity: 3,
      pricePerUnit: 40,
    });

    expect(result.resultingQuantity).toBe(0);
    expect(result.resultingAverageCost).toBeUndefined();
    expect(result.realizedGain).toBe(-30);
  });

  it('rejects overselling', () => {
    expect(() => calculateInvestmentOperationEffect({
      type: 'sell',
      previousQuantity: 2,
      previousAverageCost: 50,
      quantity: 3,
      pricePerUnit: 40,
    })).toThrow('Cannot sell more quantity than currently owned');
  });
});

describe('calculateInternalTransferEffect', () => {
  it('moves cash between accounts and charges fees only to the source account', () => {
    expect(calculateInternalTransferEffect(1000, 2.5)).toEqual({
      fromCashDelta: -1002.5,
      toCashDelta: 1000,
    });
  });
});

describe('investment operation service regression guards', () => {
  it('does not pre-validate create operations with a synthetic zero previous quantity', () => {
    const source = readFileSync('lib/services/investmentOperationService.ts', 'utf8');
    const createBlock = source.match(
      /export async function createInvestmentOperation[\s\S]*?const fees = input\.fees \?\? 0;/
    );

    expect(createBlock?.[0]).toBeDefined();
    expect(createBlock?.[0]).not.toContain('previousQuantity: 0');
  });
});

describe('updateInvestmentOperation historical edits', () => {
  it('prefetches sibling operations with asset and user constraints before updating an existing operation', async () => {
    const { updateInvestmentOperation } = await import('@/lib/services/investmentOperationService');

    getDocsMock.mockImplementationOnce(async (reference: unknown) => {
      if (!isMockQueryReference(reference)) {
        throw new Error('Unsupported getDocs reference');
      }

      if (
        reference.collectionName === 'investmentOperations'
        && !hasQueryConstraint(reference, 'userId', 'user-1')
      ) {
        throw new Error('Missing or insufficient permissions');
      }

      return { docs: executeQuery(reference) };
    });

    seedDoc('assets/asset-1', {
      userId: 'user-1',
      assetClass: 'etf',
      quantity: 10,
      averageCost: 100,
      currency: 'EUR',
      name: 'ETF Europa',
      ticker: 'ETF-EU',
    });
    seedDoc('investmentOperations/op-1', {
      userId: 'user-1',
      assetId: 'asset-1',
      assetName: 'ETF Europa',
      assetTicker: 'ETF-EU',
      type: 'buy',
      date: new Date('2026-01-10T00:00:00.000Z'),
      quantity: 10,
      pricePerUnit: 100,
      grossAmount: 1000,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      previousQuantity: 0,
      previousAverageCost: undefined,
      resultingQuantity: 10,
      resultingAverageCost: 100,
      netCashEffect: -1000,
      createdAt: new Date('2026-01-10T08:00:00.000Z'),
      updatedAt: new Date('2026-01-10T08:00:00.000Z'),
    });
    seedDoc('investmentOperations/other-user-op', {
      userId: 'user-2',
      assetId: 'asset-1',
      assetName: 'ETF Europa',
      assetTicker: 'ETF-EU',
      type: 'buy',
      date: new Date('2026-01-11T00:00:00.000Z'),
      quantity: 1,
      pricePerUnit: 100,
      grossAmount: 100,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      previousQuantity: 0,
      resultingQuantity: 1,
      resultingAverageCost: 100,
      netCashEffect: -100,
      createdAt: new Date('2026-01-11T08:00:00.000Z'),
      updatedAt: new Date('2026-01-11T08:00:00.000Z'),
    });

    await expect(updateInvestmentOperation('op-1', {
      assetId: 'asset-1',
      type: 'buy',
      date: new Date('2026-01-10T00:00:00.000Z'),
      quantity: 10,
      pricePerUnit: 100,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
    })).resolves.toBeUndefined();

    const siblingQuery = getDocsMock.mock.calls[0]?.[0];
    expect(isMockQueryReference(siblingQuery)).toBe(true);
    if (!isMockQueryReference(siblingQuery)) {
      throw new Error('Expected investment operation sibling prefetch query');
    }
    expect(hasQueryConstraint(siblingQuery, 'assetId', 'asset-1')).toBe(true);
    expect(hasQueryConstraint(siblingQuery, 'userId', 'user-1')).toBe(true);
  });

  it('replays the ledger when editing a non-latest operation and updates asset and cash by delta', async () => {
    const { updateInvestmentOperation } = await import('@/lib/services/investmentOperationService');

    seedDoc('assets/asset-1', {
      userId: 'user-1',
      assetClass: 'etf',
      quantity: 15,
      averageCost: (1000 + 600) / 15,
      currency: 'EUR',
      name: 'ETF Europa',
      ticker: 'ETF-EU',
    });
    seedDoc('assets/cash-1', {
      userId: 'user-1',
      assetClass: 'cash',
      quantity: 1000,
      currency: 'EUR',
      name: 'Conto Principale',
    });
    seedDoc('investmentOperations/op-1', {
      userId: 'user-1',
      assetId: 'asset-1',
      assetName: 'ETF Europa',
      assetTicker: 'ETF-EU',
      type: 'buy',
      date: new Date('2026-01-10T00:00:00.000Z'),
      quantity: 10,
      pricePerUnit: 100,
      grossAmount: 1000,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      cashAssetId: 'cash-1',
      cashAssetName: 'Conto Principale',
      previousQuantity: 0,
      previousAverageCost: undefined,
      resultingQuantity: 10,
      resultingAverageCost: 100,
      realizedGain: undefined,
      realizedGainTax: undefined,
      netCashEffect: -1000,
      createdAt: new Date('2026-01-10T08:00:00.000Z'),
      updatedAt: new Date('2026-01-10T08:00:00.000Z'),
    });
    seedDoc('investmentOperations/op-2', {
      userId: 'user-1',
      assetId: 'asset-1',
      assetName: 'ETF Europa',
      assetTicker: 'ETF-EU',
      type: 'buy',
      date: new Date('2026-02-10T00:00:00.000Z'),
      quantity: 5,
      pricePerUnit: 120,
      grossAmount: 600,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      cashAssetId: 'cash-1',
      cashAssetName: 'Conto Principale',
      previousQuantity: 10,
      previousAverageCost: 100,
      resultingQuantity: 15,
      resultingAverageCost: (1000 + 600) / 15,
      realizedGain: undefined,
      realizedGainTax: undefined,
      netCashEffect: -600,
      createdAt: new Date('2026-02-10T08:00:00.000Z'),
      updatedAt: new Date('2026-02-10T08:00:00.000Z'),
    });

    await expect(updateInvestmentOperation('op-1', {
      assetId: 'asset-1',
      type: 'buy',
      date: new Date('2026-01-10T00:00:00.000Z'),
      quantity: 8,
      pricePerUnit: 100,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      cashAssetId: 'cash-1',
    })).resolves.toBeUndefined();

    const updatedAsset = readDoc('assets/asset-1');
    expect(updatedAsset.quantity).toBe(13);
    expect(updatedAsset.averageCost as number).toBeCloseTo((800 + 600) / 13, 6);

    const editedOperation = readDoc('investmentOperations/op-1');
    expect(editedOperation.previousQuantity).toBe(0);
    expect(editedOperation.resultingQuantity).toBe(8);
    expect(editedOperation.netCashEffect).toBe(-800);

    const followingOperation = readDoc('investmentOperations/op-2');
    expect(followingOperation.previousQuantity).toBe(8);
    expect(followingOperation.previousAverageCost as number).toBeCloseTo(100, 6);
    expect(followingOperation.resultingQuantity).toBe(13);
    expect(followingOperation.netCashEffect).toBe(-600);

    const updatedCash = readDoc('assets/cash-1');
    expect(updatedCash.quantity).toBe(1200);

    expect(invalidateDashboardOverviewSummaryMock).toHaveBeenCalledWith('user-1', 'investment_operation_updated');
  });

  it('applies only net cash deltas when changing linked cash asset on a historical edit', async () => {
    const { updateInvestmentOperation } = await import('@/lib/services/investmentOperationService');

    seedDoc('assets/asset-1', {
      userId: 'user-1',
      assetClass: 'etf',
      quantity: 5,
      averageCost: 10,
      currency: 'EUR',
      name: 'ETF Italia',
      ticker: 'ETF-IT',
    });
    seedDoc('assets/cash-1', {
      userId: 'user-1',
      assetClass: 'cash',
      quantity: 1000,
      currency: 'EUR',
      name: 'Conto A',
    });
    seedDoc('assets/cash-2', {
      userId: 'user-1',
      assetClass: 'cash',
      quantity: 500,
      currency: 'EUR',
      name: 'Conto B',
    });
    seedDoc('investmentOperations/op-1', {
      userId: 'user-1',
      assetId: 'asset-1',
      assetName: 'ETF Italia',
      assetTicker: 'ETF-IT',
      type: 'buy',
      date: new Date('2026-01-05T00:00:00.000Z'),
      quantity: 10,
      pricePerUnit: 10,
      grossAmount: 100,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      cashAssetId: 'cash-1',
      cashAssetName: 'Conto A',
      previousQuantity: 0,
      previousAverageCost: undefined,
      resultingQuantity: 10,
      resultingAverageCost: 10,
      realizedGain: undefined,
      realizedGainTax: undefined,
      netCashEffect: -100,
      createdAt: new Date('2026-01-05T08:00:00.000Z'),
      updatedAt: new Date('2026-01-05T08:00:00.000Z'),
    });
    seedDoc('investmentOperations/op-2', {
      userId: 'user-1',
      assetId: 'asset-1',
      assetName: 'ETF Italia',
      assetTicker: 'ETF-IT',
      type: 'sell',
      date: new Date('2026-02-05T00:00:00.000Z'),
      quantity: 5,
      pricePerUnit: 20,
      grossAmount: 100,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      cashAssetId: 'cash-1',
      cashAssetName: 'Conto A',
      previousQuantity: 10,
      previousAverageCost: 10,
      resultingQuantity: 5,
      resultingAverageCost: 10,
      realizedGain: 50,
      realizedGainTax: 0,
      netCashEffect: 100,
      createdAt: new Date('2026-02-05T08:00:00.000Z'),
      updatedAt: new Date('2026-02-05T08:00:00.000Z'),
    });

    await expect(updateInvestmentOperation('op-1', {
      assetId: 'asset-1',
      type: 'buy',
      date: new Date('2026-01-05T00:00:00.000Z'),
      quantity: 10,
      pricePerUnit: 10,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      cashAssetId: 'cash-2',
    })).resolves.toBeUndefined();

    expect(readDoc('assets/cash-1').quantity).toBe(1100);
    expect(readDoc('assets/cash-2').quantity).toBe(400);
    expect(readDoc('investmentOperations/op-2').netCashEffect).toBe(100);
    expect(readDoc('investmentOperations/op-2').previousQuantity).toBe(10);
  });

  it('still rejects changing the linked investment asset', async () => {
    const { updateInvestmentOperation } = await import('@/lib/services/investmentOperationService');

    seedDoc('assets/asset-1', {
      userId: 'user-1',
      assetClass: 'etf',
      quantity: 10,
      averageCost: 100,
      currency: 'EUR',
      name: 'ETF Europa',
      ticker: 'ETF-EU',
    });
    seedDoc('investmentOperations/op-1', {
      userId: 'user-1',
      assetId: 'asset-1',
      assetName: 'ETF Europa',
      assetTicker: 'ETF-EU',
      type: 'buy',
      date: new Date('2026-01-10T00:00:00.000Z'),
      quantity: 10,
      pricePerUnit: 100,
      grossAmount: 1000,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
      previousQuantity: 0,
      previousAverageCost: undefined,
      resultingQuantity: 10,
      resultingAverageCost: 100,
      netCashEffect: -1000,
      createdAt: new Date('2026-01-10T08:00:00.000Z'),
      updatedAt: new Date('2026-01-10T08:00:00.000Z'),
    });

    await expect(updateInvestmentOperation('op-1', {
      assetId: 'asset-2',
      type: 'buy',
      date: new Date('2026-01-10T00:00:00.000Z'),
      quantity: 10,
      pricePerUnit: 100,
      fees: 0,
      taxes: 0,
      currency: 'EUR',
    })).rejects.toThrow('Changing the linked asset is not supported. Delete and recreate the operation.');
  });
});

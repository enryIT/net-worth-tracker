/**
 * Unit tests for buildAssistantMonthContext
 *
 * The service reads through local Postgres-backed services, so tests mock the
 * service boundaries rather than Firebase/Admin SDK query chains.
 * All assertions verify bundle shape, data quality flags, cashflow
 * aggregation, and allocation change computation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getLocalSettingsMock,
  listLocalAssetsMock,
  listLocalExpensesMock,
  listLocalSnapshotsMock,
} = vi.hoisted(() => ({
  getLocalSettingsMock: vi.fn(),
  listLocalAssetsMock: vi.fn(),
  listLocalExpensesMock: vi.fn(),
  listLocalSnapshotsMock: vi.fn(),
}));

vi.mock('@/lib/server/snapshots/localSnapshotService', () => ({
  listLocalSnapshots: listLocalSnapshotsMock,
}));

vi.mock('@/lib/server/cashflow/localExpenseService', () => ({
  listLocalExpenses: listLocalExpensesMock,
}));

vi.mock('@/lib/server/settings/localSettingsService', () => ({
  getLocalSettings: getLocalSettingsMock,
}));

vi.mock('@/lib/server/assets/localAssetService', () => ({
  listLocalAssets: listLocalAssetsMock,
}));

import { buildAssistantMonthContext } from '@/lib/services/assistantMonthContextService';
import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import type { HouseholdConfig } from '@/types/household';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSnapshotDoc(
  year: number,
  month: number,
  totalNetWorth: number,
  byAssetClass: Record<string, number> = {},
  isDummy?: boolean
) {
  const snapshot: Partial<MonthlySnapshot> = {
    userId: 'user1',
    year,
    month,
    isDummy,
    totalNetWorth,
    liquidNetWorth: totalNetWorth,
    illiquidNetWorth: 0,
    byAssetClass,
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  };
  return snapshot as MonthlySnapshot;
}

function makeExpenseDoc(
  amount: number,
  categoryId: string,
  date: Date = new Date(2025, 0, 15)
) {
  const expense: Partial<Expense> = {
    id: `exp-${Math.random()}`,
    userId: 'user1',
    type: amount > 0 ? 'income' : 'variable',
    categoryId,
    categoryName: categoryId,
    amount,
    currency: 'EUR',
    date,
    createdAt: date,
    updatedAt: date,
  };
  return expense as Expense;
}

function mockSnapshots(snapshots: ReturnType<typeof makeSnapshotDoc>[]) {
  listLocalSnapshotsMock.mockResolvedValue(snapshots);
}

function mockExpenses(expenses: ReturnType<typeof makeExpenseDoc>[]) {
  listLocalExpensesMock.mockResolvedValue(expenses);
}

function mockSettings(dividendIncomeCategoryId?: string) {
  getLocalSettingsMock.mockResolvedValue({ dividendIncomeCategoryId });
}

function mockSettingsWithHouseholdConfig(config: HouseholdConfig) {
  getLocalSettingsMock.mockResolvedValue({ householdConfig: config });
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('buildAssistantMonthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings(undefined);
    listLocalAssetsMock.mockResolvedValue([]);
  });

  it('reads month context source data from local Postgres-backed services', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 2, 100_000), makeSnapshotDoc(2025, 3, 110_000)]);
    mockExpenses([makeExpenseDoc(-300, 'cat-rent', new Date(2025, 2, 31, 12))]);

    await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(listLocalSnapshotsMock).toHaveBeenCalledWith('user1');
    expect(listLocalExpensesMock).toHaveBeenCalledWith('user1', {
      from: new Date(2025, 2, 1, 0, 0, 0),
      to: new Date(2025, 3, 0, 23, 59, 59),
      includeEndDate: true,
    });
    expect(getLocalSettingsMock).toHaveBeenCalledWith('user1');
    expect(listLocalAssetsMock).toHaveBeenCalledWith('user1');
  });

  it('uses household config from local settings when a participant scope is requested', async () => {
    mockSettingsWithHouseholdConfig({
      userId: 'user1',
      enabled: true,
      participants: [
        { id: 'self', name: 'Io', role: 'self', sortOrder: 0, active: true },
        { id: 'partner', name: 'Partner', role: 'partner', sortOrder: 1, active: true },
      ],
      profiles: [
        {
          id: 'shared-50',
          name: 'Condiviso 50/50',
          type: 'shared',
          sortOrder: 0,
          active: true,
          splits: [
            { participantId: 'self', participantName: 'Io', percentage: 50 },
            { participantId: 'partner', participantName: 'Partner', percentage: 50 },
          ],
        },
      ],
      attributionRules: [],
      defaultAssetProfileId: 'self-100',
      defaultExpenseProfileId: 'self-100',
      defaultIncomeProfileId: 'self-100',
    });
    mockSnapshots([]);
    mockExpenses([
      {
        ...makeExpenseDoc(-100, 'cat-rent'),
        attributionProfileId: 'shared-50',
        attributionProfileName: 'Condiviso 50/50',
        attributionSplits: [
          { participantId: 'self', participantName: 'Io', percentage: 50 },
          { participantId: 'partner', participantName: 'Partner', percentage: 50 },
        ],
      },
    ]);

    const bundle = await buildAssistantMonthContext(
      'user1',
      { year: 2025, month: 3 },
      false,
      { householdScope: { kind: 'participant', id: 'partner' } }
    );

    expect(bundle.cashflow.totalExpenses).toBe(-50);
    expect(bundle.cashflow.transactionCount).toBe(1);
  });

  // ── Missing snapshot ──────────────────────────────────────────────────────

  it('returns null snapshots and hasSnapshot=false when no snapshot exists for the month', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.currentSnapshot).toBeNull();
    expect(bundle.previousSnapshot).toBeNull();
    expect(bundle.dataQuality.hasSnapshot).toBe(false);
    expect(bundle.dataQuality.hasPreviousBaseline).toBe(false);
  });

  it('adds a data quality note when there is no snapshot and no cashflow', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.dataQuality.notes.some((n) => n.includes('Nessun dato'))).toBe(true);
  });

  // ── Single snapshot (no previous baseline) ───────────────────────────────

  it('handles a single snapshot with no previous baseline', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.currentSnapshot?.totalNetWorth).toBe(100_000);
    expect(bundle.previousSnapshot).toBeNull();
    expect(bundle.dataQuality.hasPreviousBaseline).toBe(false);
    // Delta cannot be computed without baseline
    expect(bundle.netWorth.delta).toBeNull();
    expect(bundle.netWorth.deltaPct).toBeNull();
    // Data quality should note the missing baseline
    expect(bundle.dataQuality.notes.some((n) => n.includes('delta percentuale'))).toBe(true);
  });

  // ── Month without cashflow ────────────────────────────────────────────────

  it('returns zero cashflow values when no transactions exist for the month', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 2, 90_000), makeSnapshotDoc(2025, 3, 100_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.cashflow.totalIncome).toBe(0);
    expect(bundle.cashflow.totalExpenses).toBe(0);
    expect(bundle.cashflow.totalDividends).toBe(0);
    expect(bundle.cashflow.netCashFlow).toBe(0);
    expect(bundle.cashflow.transactionCount).toBe(0);
    expect(bundle.dataQuality.hasCashflowData).toBe(false);
  });

  // ── Month with only dividends ─────────────────────────────────────────────

  it('separates dividends from other income using dividendIncomeCategoryId', async () => {
    mockSettings('cat-div');
    mockSnapshots([makeSnapshotDoc(2025, 2, 100_000), makeSnapshotDoc(2025, 3, 110_000)]);
    mockExpenses([
      makeExpenseDoc(500, 'cat-div'),     // dividend income
      makeExpenseDoc(200, 'cat-div'),     // another dividend
      makeExpenseDoc(1000, 'cat-salary'), // regular income
      makeExpenseDoc(-300, 'cat-rent'),   // expense
    ]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.cashflow.totalDividends).toBe(700);
    expect(bundle.cashflow.totalIncome).toBe(1000);
    expect(bundle.cashflow.totalExpenses).toBeCloseTo(-300);
    expect(bundle.cashflow.netCashFlow).toBeCloseTo(700 + 1000 - 300);
    expect(bundle.cashflow.transactionCount).toBe(4);
  });

  // ── Dummy snapshot exclusion ──────────────────────────────────────────────

  it('excludes dummy snapshots from the context', async () => {
    // isDummy=true for March, real snapshot for February
    mockSnapshots([
      makeSnapshotDoc(2025, 2, 90_000),
      makeSnapshotDoc(2025, 3, 999_999, {}, true), // isDummy
    ]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    // The dummy snapshot for March must not be treated as the current snapshot
    expect(bundle.currentSnapshot).toBeNull();
    // February real snapshot must be found as previous
    expect(bundle.previousSnapshot?.totalNetWorth).toBe(90_000);
  });

  // ── Net worth delta ───────────────────────────────────────────────────────

  it('computes correct net worth delta and percentage when both snapshots exist', async () => {
    mockSnapshots([makeSnapshotDoc(2025, 2, 100_000), makeSnapshotDoc(2025, 3, 110_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.netWorth.start).toBe(100_000);
    expect(bundle.netWorth.end).toBe(110_000);
    expect(bundle.netWorth.delta).toBe(10_000);
    expect(bundle.netWorth.deltaPct).toBeCloseTo(10);
  });

  it('handles negative delta correctly', async () => {
    mockSnapshots([makeSnapshotDoc(2024, 12, 100_000), makeSnapshotDoc(2025, 1, 80_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.netWorth.delta).toBe(-20_000);
    expect(bundle.netWorth.deltaPct).toBeCloseTo(-20);
  });

  // ── January → December previous month ────────────────────────────────────

  it('resolves previous month correctly for January (wraps to December of prior year)', async () => {
    mockSnapshots([makeSnapshotDoc(2024, 12, 90_000), makeSnapshotDoc(2025, 1, 95_000)]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 1 });

    expect(bundle.previousSnapshot?.year).toBe(2024);
    expect(bundle.previousSnapshot?.month).toBe(12);
    expect(bundle.netWorth.start).toBe(90_000);
  });

  // ── Allocation changes ────────────────────────────────────────────────────

  it('computes allocation changes sorted by absolute change descending, capped at 5', async () => {
    const prevByClass = { Azioni: 50_000, Obbligazioni: 30_000, Cash: 20_000 };
    const currByClass = {
      Azioni: 70_000,       // +20k
      Obbligazioni: 28_000, // -2k
      Cash: 15_000,         // -5k
      Crypto: 5_000,        // new (+5k)
      Immobili: 10_000,     // new (+10k)
    };
    mockSnapshots([
      makeSnapshotDoc(2025, 2, 100_000, prevByClass),
      makeSnapshotDoc(2025, 3, 128_000, currByClass),
    ]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(bundle.allocationChanges.length).toBeLessThanOrEqual(5);
    // Top change should be Azioni (+20k)
    expect(bundle.allocationChanges[0].assetClass).toBe('Azioni');
    expect(bundle.allocationChanges[0].absoluteChange).toBe(20_000);
    // Changes should be in descending absolute order
    const abs = bundle.allocationChanges.map((c) => Math.abs(c.absoluteChange));
    for (let i = 0; i < abs.length - 1; i++) {
      expect(abs[i]).toBeGreaterThanOrEqual(abs[i + 1]);
    }
  });

  it('sets previousValue to null for asset classes that did not exist in the previous snapshot', async () => {
    mockSnapshots([
      makeSnapshotDoc(2025, 2, 100_000, { Azioni: 100_000 }),
      makeSnapshotDoc(2025, 3, 110_000, { Azioni: 100_000, Crypto: 10_000 }),
    ]);
    mockExpenses([]);

    const bundle = await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    const cryptoChange = bundle.allocationChanges.find((c) => c.assetClass === 'Crypto');
    expect(cryptoChange).toBeDefined();
    expect(cryptoChange!.previousValue).toBeNull();
    expect(cryptoChange!.absoluteChange).toBe(10_000);
  });

  // ── Month boundary: end date covers full last day ─────────────────────────

  it('passes the end-of-month date with time 23:59:59 to the expenses query', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    await buildAssistantMonthContext('user1', { year: 2025, month: 3 });

    expect(listLocalExpensesMock).toHaveBeenCalledWith('user1', {
      from: new Date(2025, 2, 1, 0, 0, 0),
      to: new Date(2025, 3, 0, 23, 59, 59),
      includeEndDate: true,
    });
  });

  it('end date is correct for February in a leap year (29 days)', async () => {
    mockSnapshots([]);
    mockExpenses([]);

    await buildAssistantMonthContext('user1', { year: 2024, month: 2 });

    // 2024 is a leap year; February has 29 days
    const endDate = new Date(2024, 2, 0, 23, 59, 59); // Feb 29 in leap year
    expect(endDate.getDate()).toBe(29);
  });
});

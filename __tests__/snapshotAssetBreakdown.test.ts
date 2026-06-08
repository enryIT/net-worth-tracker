/**
 * Unit tests for snapshotAssetBreakdown.ts — pure helpers behind the Storico
 * "Valore per strumento" section.
 *
 * All functions only read MonthlySnapshot.byAsset (values already frozen at snapshot time),
 * so fixtures construct minimal snapshots with just the fields these helpers touch.
 */

import { describe, it, expect } from 'vitest';
import {
  getAvailableSnapshotMonths,
  sortAssetsByValue,
  sumSelectedValues,
  buildSelectedAssetTrend,
  type SnapshotAsset,
} from '@/lib/utils/snapshotAssetBreakdown';
import type { MonthlySnapshot } from '@/types/assets';

function makeAsset(overrides: Partial<SnapshotAsset> & { assetId: string; totalValue: number }): SnapshotAsset {
  return {
    ticker: overrides.assetId.toUpperCase(),
    name: overrides.assetId,
    quantity: 1,
    price: overrides.totalValue,
    ...overrides,
  };
}

function makeSnapshot(
  year: number,
  month: number,
  byAsset: SnapshotAsset[] | undefined
): MonthlySnapshot {
  return {
    userId: 'u1',
    year,
    month,
    totalNetWorth: (byAsset ?? []).reduce((s, a) => s + a.totalValue, 0),
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: byAsset as MonthlySnapshot['byAsset'],
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 1),
  };
}

describe('getAvailableSnapshotMonths', () => {
  it('excludes snapshots without a per-asset breakdown and sorts newest first', () => {
    // Arrange
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2025, 12, [makeAsset({ assetId: 'a', totalValue: 100 })]),
      makeSnapshot(2026, 1, undefined), // pre-byAsset snapshot
      makeSnapshot(2026, 2, []), // empty breakdown
      makeSnapshot(2026, 3, [makeAsset({ assetId: 'a', totalValue: 120 })]),
    ];

    // Act
    const months = getAvailableSnapshotMonths(snapshots);

    // Assert
    expect(months.map((m) => m.key)).toEqual(['2026-3', '2025-12']);
    expect(months[0].label).toBe('Marzo 2026');
  });
});

describe('sortAssetsByValue', () => {
  it('orders assets by total value descending without mutating the input', () => {
    // Arrange
    const byAsset = [
      makeAsset({ assetId: 'small', totalValue: 50 }),
      makeAsset({ assetId: 'big', totalValue: 500 }),
      makeAsset({ assetId: 'mid', totalValue: 200 }),
    ];

    // Act
    const sorted = sortAssetsByValue(byAsset);

    // Assert
    expect(sorted.map((a) => a.assetId)).toEqual(['big', 'mid', 'small']);
    expect(byAsset.map((a) => a.assetId)).toEqual(['small', 'big', 'mid']);
  });
});

describe('sumSelectedValues', () => {
  it('sums only the selected assets and returns 0 for an empty selection', () => {
    // Arrange
    const byAsset = [
      makeAsset({ assetId: 'a', totalValue: 100 }),
      makeAsset({ assetId: 'b', totalValue: 250 }),
      makeAsset({ assetId: 'c', totalValue: 75 }),
    ];

    // Act + Assert
    expect(sumSelectedValues(byAsset, new Set(['a', 'c']))).toBe(175);
    expect(sumSelectedValues(byAsset, new Set())).toBe(0);
  });
});

describe('buildSelectedAssetTrend', () => {
  it('produces one chronological point per month, treating an absent asset as 0', () => {
    // Arrange — asset "b" only exists from 2026-02 (bought later)
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 2, [
        makeAsset({ assetId: 'a', totalValue: 120 }),
        makeAsset({ assetId: 'b', totalValue: 80 }),
      ]),
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'a', totalValue: 100 })]),
    ];

    // Act
    const trend = buildSelectedAssetTrend(snapshots, new Set(['a', 'b']));

    // Assert — chronological, January has no "b" so only "a" counts
    expect(trend.map((p) => p.key)).toEqual(['2026-1', '2026-2']);
    expect(trend.map((p) => p.total)).toEqual([100, 200]);
  });

  it('returns an empty array when nothing is selected', () => {
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'a', totalValue: 100 })]),
    ];
    expect(buildSelectedAssetTrend(snapshots, new Set())).toEqual([]);
  });
});

/**
 * Snapshot Asset Breakdown — pure helpers for the Storico "Valore per strumento" section.
 *
 * Every MonthlySnapshot already carries a `byAsset` array with each instrument's value frozen
 * at snapshot time (`totalValue`, computed via calculateAssetValue — so all the EUR/GBp/real-estate
 * and quantity×price rules are already baked in). These helpers only READ that data:
 *  - list the months that have a per-asset breakdown,
 *  - sort a month's assets by value,
 *  - sum a user-selected subset for a given month,
 *  - build the cross-month trend of a selected subset's combined value.
 *
 * No value re-computation happens here — the snapshot is the source of truth.
 */

import type { MonthlySnapshot } from '@/types/assets';
import { MONTH_NAMES } from '@/lib/constants/months';

/** A single asset entry as stored inside a snapshot. */
export type SnapshotAsset = MonthlySnapshot['byAsset'][number];

/** A selectable month in the breakdown UI. `key` is the stable Select value. */
export interface SnapshotMonthOption {
  key: string; // `${year}-${month}`
  year: number;
  month: number; // 1-12
  label: string; // e.g. "Marzo 2026"
}

/** One point of the selected-assets combined-value trend. */
export interface SelectedAssetTrendPoint {
  key: string; // `${year}-${month}`
  label: string; // e.g. "Marzo 2026"
  year: number;
  month: number;
  total: number; // sum of selected assets' totalValue present in this month
}

/** Build the stable Select value for a year/month pair. */
function buildMonthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

/** Human-readable Italian label for a year/month pair. */
function buildMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** True when a snapshot carries a non-empty per-asset breakdown. */
function hasAssetBreakdown(snapshot: MonthlySnapshot): boolean {
  return Array.isArray(snapshot.byAsset) && snapshot.byAsset.length > 0;
}

/**
 * List the months that have a per-asset breakdown, most recent first.
 *
 * Snapshots created before the `byAsset` field existed (or empty ones) are excluded — they would
 * render an empty table. Sorting is descending so the latest month is the default selection.
 *
 * @param snapshots - All user snapshots (any order)
 * @returns Selectable month options, newest first
 */
export function getAvailableSnapshotMonths(
  snapshots: MonthlySnapshot[]
): SnapshotMonthOption[] {
  return snapshots
    .filter(hasAssetBreakdown)
    .map((snapshot) => ({
      key: buildMonthKey(snapshot.year, snapshot.month),
      year: snapshot.year,
      month: snapshot.month,
      label: buildMonthLabel(snapshot.year, snapshot.month),
    }))
    .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month));
}

/**
 * Return a copy of a month's assets sorted by total value, largest first.
 * Does not mutate the input array.
 */
export function sortAssetsByValue(byAsset: SnapshotAsset[]): SnapshotAsset[] {
  return [...byAsset].sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Sum the total value of the selected assets within a single month.
 *
 * @param byAsset - The chosen month's asset breakdown
 * @param selectedIds - Set of selected assetIds
 * @returns Combined value of the selected assets (0 when nothing is selected)
 */
export function sumSelectedValues(
  byAsset: SnapshotAsset[],
  selectedIds: Set<string>
): number {
  return byAsset.reduce(
    (sum, asset) => (selectedIds.has(asset.assetId) ? sum + asset.totalValue : sum),
    0
  );
}

/**
 * Build the combined-value trend of the selected assets across all months that have a breakdown.
 *
 * One point per month (chronological order), summing the `totalValue` of the selected assetIds
 * that exist in that month. An asset absent from a given month (bought later, already sold)
 * contributes 0 for that month, so the line reflects the real combined exposure over time.
 *
 * @param snapshots - All user snapshots (any order)
 * @param selectedIds - Set of selected assetIds
 * @returns Trend points oldest-first, or [] when nothing is selected
 */
export function buildSelectedAssetTrend(
  snapshots: MonthlySnapshot[],
  selectedIds: Set<string>
): SelectedAssetTrendPoint[] {
  if (selectedIds.size === 0) {
    return [];
  }

  return snapshots
    .filter(hasAssetBreakdown)
    .slice()
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .map((snapshot) => ({
      key: buildMonthKey(snapshot.year, snapshot.month),
      label: buildMonthLabel(snapshot.year, snapshot.month),
      year: snapshot.year,
      month: snapshot.month,
      total: sumSelectedValues(snapshot.byAsset, selectedIds),
    }));
}

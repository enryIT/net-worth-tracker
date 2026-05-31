/**
 * Snapshot Service
 *
 * Manages monthly portfolio snapshots for historical tracking and performance analysis.
 *
 * Features:
 * - Create snapshots from current asset state (with optional custom date)
 * - Fetch snapshots with sorting and filtering by date range
 * - Calculate month-over-month and year-to-date changes
 * - Add/update/delete notes for specific snapshots
 *
 * Storage format: Snapshot ID is "userId-YYYY-M" (month without padding)
 * Snapshots are sorted by year (asc), then month (asc) for chronological order.
 */

import { Asset, MonthlySnapshot } from '@/types/assets';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
  calculateFIRENetWorth,
} from './assetService';
import { calculateCurrentAllocation } from './assetAllocationService';
import { getHouseholdConfig } from './householdService';
import { getItalyMonthYear, toDate } from '@/lib/utils/dateHelpers';
import { buildOwnershipSnapshotBreakdown, getDefaultHouseholdConfig } from '@/lib/utils/householdUtils';

const SNAPSHOTS_API_PATH = '/api/snapshots';

type SnapshotWritePayload = {
  year: number;
  month: number;
  isDummy?: boolean;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  fireNetWorth?: number;
  byAssetClass: { [assetClass: string]: number };
  byAsset: MonthlySnapshot['byAsset'];
  byOwnershipProfile?: MonthlySnapshot['byOwnershipProfile'];
  byParticipant?: MonthlySnapshot['byParticipant'];
  assetAllocation: { [assetClass: string]: number };
  note?: string;
};

async function parseJsonResponse<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const payload = await response.json().catch(() => null) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : fallbackError
    );
  }

  return payload as T;
}

function mapSnapshot(snapshot: MonthlySnapshot): MonthlySnapshot {
  return {
    ...snapshot,
    createdAt: toDate(snapshot.createdAt),
  };
}

function toSnapshotWritePayload(
  snapshot: MonthlySnapshot,
  note: string
): SnapshotWritePayload {
  return {
    year: snapshot.year,
    month: snapshot.month,
    isDummy: snapshot.isDummy,
    totalNetWorth: snapshot.totalNetWorth,
    liquidNetWorth: snapshot.liquidNetWorth,
    illiquidNetWorth: snapshot.illiquidNetWorth,
    fireNetWorth: snapshot.fireNetWorth,
    byAssetClass: snapshot.byAssetClass,
    byAsset: snapshot.byAsset,
    byOwnershipProfile: snapshot.byOwnershipProfile,
    byParticipant: snapshot.byParticipant,
    assetAllocation: snapshot.assetAllocation,
    note,
  };
}

/**
 * Create a monthly snapshot from current assets
 *
 * Calculates total/liquid/illiquid net worth, asset allocation percentages,
 * and stores a point-in-time record of all assets with their values.
 *
 * @param userId - User ID
 * @param assets - Current asset array (with updated prices)
 * @param year - Optional year override (defaults to current Italy time)
 * @param month - Optional month override (defaults to current Italy time)
 * @returns Snapshot document ID (format: "userId-YYYY-M")
 */
export async function createSnapshot(
  userId: string,
  assets: Asset[],
  year?: number,
  month?: number
): Promise<string> {
  try {
    const { month: currentMonth, year: currentYear } = getItalyMonthYear();
    const snapshotYear = year ?? currentYear;
    const snapshotMonth = month ?? currentMonth;

    const totalNetWorth = calculateTotalValue(assets);
    const liquidNetWorth = calculateLiquidNetWorth(assets);
    const illiquidNetWorth = calculateIlliquidNetWorth(assets);
    // Always exclude primary residence from FIRE net worth — the flag on the asset
    // is the source of truth. Stored as a separate field so the chart can use it
    // going forward without re-deriving it from a potentially stale asset list.
    const fireNetWorth = calculateFIRENetWorth(assets, false);
    const allocation = calculateCurrentAllocation(assets);

    // Convert allocation values (absolute EUR amounts) to percentages
    // This allows comparing allocation trends over time even as portfolio size changes
    const assetAllocation: { [assetClass: string]: number } = {};
    Object.keys(allocation.byAssetClass).forEach((assetClass) => {
      assetAllocation[assetClass] =
        totalNetWorth > 0
          ? (allocation.byAssetClass[assetClass] / totalNetWorth) * 100
          : 0;
    });

    const householdConfig = await getHouseholdConfig(userId).catch((error) => {
      console.warn('Unable to load household config for snapshot, using personal mode', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return getDefaultHouseholdConfig(userId);
    });
    const ownershipBreakdown = buildOwnershipSnapshotBreakdown(
      assets,
      calculateAssetValue,
      householdConfig,
      new Date(snapshotYear, snapshotMonth - 1, 1)
    );

    const snapshotId = `${userId}-${snapshotYear}-${snapshotMonth}`;
    const payload: SnapshotWritePayload = {
      year: snapshotYear,
      month: snapshotMonth,
      totalNetWorth,
      liquidNetWorth,
      illiquidNetWorth,
      fireNetWorth,
      byAssetClass: allocation.byAssetClass,
      byAsset: ownershipBreakdown.byAsset,
      byOwnershipProfile: ownershipBreakdown.byOwnershipProfile,
      byParticipant: ownershipBreakdown.byParticipant,
      assetAllocation,
    };

    const response = await authenticatedFetch(SNAPSHOTS_API_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    await parseJsonResponse<MonthlySnapshot>(
      response,
      'Failed to create snapshot'
    );

    return snapshotId;
  } catch (error) {
    console.error('Error creating snapshot:', error);
    throw new Error('Failed to create snapshot');
  }
}

/**
 * Get all snapshots for a user, sorted chronologically (oldest first)
 *
 * Snapshots are sorted by year (asc), then month (asc) to maintain chronological order
 * for time-series analysis and charting.
 *
 * @param userId - User ID
 * @returns Array of snapshots sorted chronologically
 */
export async function getUserSnapshots(
  userId: string
): Promise<MonthlySnapshot[]> {
  try {
    const response = await authenticatedFetch(SNAPSHOTS_API_PATH, {
      method: 'GET',
    });
    const snapshots = await parseJsonResponse<MonthlySnapshot[]>(
      response,
      'Failed to fetch snapshots'
    );

    return snapshots.map(mapSnapshot);
  } catch (error) {
    console.error('Error getting snapshots:', error);
    throw new Error(`Failed to fetch snapshots for user ${userId}`, {
      cause: error,
    });
  }
}

/**
 * Get snapshots for a specific time range
 *
 * Filters snapshots between start and end dates (inclusive on both sides).
 *
 * @param userId - User ID
 * @param startYear - Start year
 * @param startMonth - Start month (1-12)
 * @param endYear - End year
 * @param endMonth - End month (1-12)
 * @returns Array of snapshots within the specified range, sorted chronologically
 */
export async function getSnapshotsInRange(
  userId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Promise<MonthlySnapshot[]> {
  try {
    const allSnapshots = await getUserSnapshots(userId);

    return allSnapshots.filter((snapshot) => {
      // Convert year/month to comparable integer: YYYYMM format (e.g., 2024*100 + 3 = 202403)
      // This allows simple numeric comparison for date ranges without Date object overhead
      const snapshotDate = snapshot.year * 100 + snapshot.month;
      const startDate = startYear * 100 + startMonth;
      const endDate = endYear * 100 + endMonth;

      return snapshotDate >= startDate && snapshotDate <= endDate;
    });
  } catch (error) {
    console.error('Error getting snapshots in range:', error);
    throw new Error('Failed to fetch snapshots');
  }
}

/**
 * Get the most recent snapshot for a user
 *
 * @param userId - User ID
 * @returns Latest snapshot, or null if no snapshots exist
 */
export async function getLatestSnapshot(
  userId: string
): Promise<MonthlySnapshot | null> {
  try {
    const snapshots = await getUserSnapshots(userId);

    if (snapshots.length === 0) {
      return null;
    }

    // Return the last one (already sorted chronologically by getUserSnapshots)
    return snapshots[snapshots.length - 1];
  } catch (error) {
    console.error('Error getting latest snapshot:', error);
    return null;
  }
}

/**
 * Calculate month-over-month change in net worth
 *
 * Compares current net worth with the most recent snapshot to show
 * portfolio change since last month.
 *
 * @param currentNetWorth - Current total net worth
 * @param previousSnapshot - Most recent snapshot (null if no snapshots exist)
 * @returns Object with absolute value change and percentage change
 */
export function calculateMonthlyChange(
  currentNetWorth: number,
  previousSnapshot: MonthlySnapshot | null
): {
  value: number;
  percentage: number;
} {
  if (!previousSnapshot || previousSnapshot.totalNetWorth === 0) {
    return { value: 0, percentage: 0 };
  }

  const value = currentNetWorth - previousSnapshot.totalNetWorth;
  const percentage = (value / previousSnapshot.totalNetWorth) * 100;

  return { value, percentage };
}

/**
 * Calculate annual change in net worth.
 *
 * Uses December of the previous year as baseline so that January's performance
 * is included in the annual delta (contiguous periods, no month lost).
 * Falls back to the first available snapshot of the current year when
 * December of the previous year doesn't exist (e.g. first year of data).
 *
 * @param currentNetWorth - Current total net worth
 * @param snapshots - Array of all snapshots (sorted chronologically)
 * @returns Object with absolute value change and percentage change, or null if no baseline found
 */
export function calculateYearlyChange(
  currentNetWorth: number,
  snapshots: MonthlySnapshot[]
): {
  value: number;
  percentage: number;
} | null {
  if (snapshots.length === 0) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  // Use December of previous year as baseline so that January's performance
  // is included in the annual delta. Falls back to first snapshot of current
  // year when prior December doesn't exist (first year of data).
  const baseline =
    snapshots.find(s => s.year === currentYear - 1 && s.month === 12) ??
    snapshots.find(s => s.year === currentYear);

  if (!baseline || baseline.totalNetWorth === 0) {
    return null;
  }

  const value = currentNetWorth - baseline.totalNetWorth;
  const percentage = (value / baseline.totalNetWorth) * 100;

  return { value, percentage };
}

/**
 * Update or delete a note from a monthly snapshot
 *
 * Routes note updates through the local snapshots API by upserting the matched
 * monthly snapshot payload with the new note value.
 *
 * @param userId - User ID
 * @param year - Snapshot year
 * @param month - Snapshot month (1-12)
 * @param note - Note text (empty string deletes the note)
 * @throws Error if note exceeds 500 characters
 */
export async function updateSnapshotNote(
  userId: string,
  year: number,
  month: number,
  note: string
): Promise<void> {
  const trimmedNote = note.trim();

  if (trimmedNote.length > 500) {
    throw new Error('Note cannot exceed 500 characters');
  }

  const snapshots = await getUserSnapshots(userId);
  const targetSnapshot = snapshots.find((snapshot) => (
    snapshot.year === year && snapshot.month === month
  ));

  // Legacy runtime behavior allowed writing notes before a full snapshot
  // existed. In the local schema, snapshots are strongly typed; keep this as
  // a no-op when the period is missing instead of throwing in the UI flow.
  if (!targetSnapshot) {
    return;
  }

  const response = await authenticatedFetch(SNAPSHOTS_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toSnapshotWritePayload(targetSnapshot, trimmedNote)),
  });

  await parseJsonResponse<MonthlySnapshot>(
    response,
    'Failed to update snapshot note'
  );
}

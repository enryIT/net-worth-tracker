import "server-only";

import { listLocalAssets } from "@/lib/server/assets/localAssetService";
import { invalidateLocalDashboardOverviewSummary } from "@/lib/server/dashboard/localDashboardOverviewInvalidationService";
import { updateLocalUserAssetPrices } from "@/lib/server/prices/localPriceUpdateService";
import {
  localSnapshotExists,
  upsertLocalSnapshot,
} from "@/lib/server/snapshots/localSnapshotService";
import { getItalyMonthYear } from "@/lib/utils/dateHelpers";
import {
  buildOwnershipSnapshotBreakdown,
  getDefaultHouseholdConfig,
} from "@/lib/utils/householdUtils";
import type { Asset } from "@/types/assets";

export type LocalAutomatedSnapshotOptions = {
  year?: number;
  month?: number;
};

export type LocalAutomatedSnapshotResult =
  | {
      success: true;
      message: string;
      snapshotId: string;
      data: {
        year: number;
        month: number;
        totalNetWorth: number;
        liquidNetWorth: number;
        assetsCount: number;
      };
    }
  | {
      success: false;
      message: string;
      snapshotId: null;
    };

export async function createLocalAutomatedSnapshot(
  userId: string,
  options: LocalAutomatedSnapshotOptions
): Promise<LocalAutomatedSnapshotResult> {
  try {
    await updateLocalUserAssetPrices(userId);
  } catch (error) {
    console.error("[LOCAL_AUTOMATED_SNAPSHOT_PRICE_UPDATE_ERROR]", error);
  }

  const assets = await listLocalAssets(userId);
  if (assets.length === 0) {
    return {
      success: false,
      message: "No assets found for user",
      snapshotId: null,
    };
  }

  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const snapshotYear = options.year ?? currentYear;
  const snapshotMonth = options.month ?? currentMonth;
  const totalNetWorth = calculateTotalValue(assets);
  const liquidNetWorth = calculateLiquidNetWorth(assets);
  const illiquidNetWorth = calculateIlliquidNetWorth(assets);
  const fireNetWorth = calculateFIRENetWorth(assets, false);
  const byAssetClass = calculateByAssetClass(assets);
  const assetAllocation = buildAllocationPercentages(byAssetClass, totalNetWorth);
  const householdConfig = getDefaultHouseholdConfig(userId);
  const ownershipBreakdown = buildOwnershipSnapshotBreakdown(
    assets,
    calculateAssetValue,
    householdConfig,
    new Date(snapshotYear, snapshotMonth - 1, 1)
  );
  const existed = await localSnapshotExists(userId, snapshotYear, snapshotMonth);

  await upsertLocalSnapshot(userId, {
    year: snapshotYear,
    month: snapshotMonth,
    totalNetWorth,
    liquidNetWorth,
    illiquidNetWorth,
    fireNetWorth,
    byAssetClass,
    byAsset: ownershipBreakdown.byAsset,
    byOwnershipProfile: ownershipBreakdown.byOwnershipProfile,
    byParticipant: ownershipBreakdown.byParticipant,
    assetAllocation,
  });
  await invalidateLocalDashboardOverviewSummary(
    userId,
    existed ? "snapshot_overwritten" : "snapshot_created"
  );

  return {
    success: true,
    message: existed
      ? "Snapshot aggiornato con successo"
      : "Snapshot creato con successo",
    snapshotId: `${userId}-${snapshotYear}-${snapshotMonth}`,
    data: {
      year: snapshotYear,
      month: snapshotMonth,
      totalNetWorth,
      liquidNetWorth,
      assetsCount: assets.length,
    },
  };
}

function calculateAssetValue(asset: Asset): number {
  const normalizedFallbackPrice =
    asset.currency === "GBp" ? asset.currentPrice / 100 : asset.currentPrice;
  const priceInEur =
    asset.currency &&
    asset.currency.toUpperCase() !== "EUR" &&
    asset.currentPriceEur !== undefined
      ? asset.currentPriceEur
      : normalizedFallbackPrice;
  const baseValue = asset.quantity * priceInEur;

  if (asset.assetClass === "realestate" && asset.outstandingDebt) {
    return Math.max(0, baseValue - asset.outstandingDebt);
  }

  return baseValue;
}

function calculateTotalValue(assets: Asset[]): number {
  return assets.reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
}

function calculateLiquidNetWorth(assets: Asset[]): number {
  return assets
    .filter((asset) => {
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid;
      }

      return (
        asset.assetClass !== "realestate" &&
        asset.type !== "pensionfund" &&
        asset.subCategory !== "Private Equity"
      );
    })
    .reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
}

function calculateIlliquidNetWorth(assets: Asset[]): number {
  return assets
    .filter((asset) => {
      if (asset.isLiquid !== undefined) {
        return !asset.isLiquid;
      }

      return (
        asset.assetClass === "realestate" ||
        asset.type === "pensionfund" ||
        asset.subCategory === "Private Equity"
      );
    })
    .reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
}

function calculateFIRENetWorth(
  assets: Asset[],
  includePrimaryResidence: boolean
): number {
  return assets
    .filter((asset) => {
      return !(
        !includePrimaryResidence &&
        asset.assetClass === "realestate" &&
        asset.isPrimaryResidence === true
      );
    })
    .reduce((sum, asset) => sum + calculateAssetValue(asset), 0);
}

function calculateByAssetClass(assets: Asset[]): Record<string, number> {
  return assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.assetClass] = (acc[asset.assetClass] ?? 0) + calculateAssetValue(asset);
    return acc;
  }, {});
}

function buildAllocationPercentages(
  byAssetClass: Record<string, number>,
  totalNetWorth: number
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(byAssetClass).map(([assetClass, value]) => [
      assetClass,
      totalNetWorth > 0 ? (value / totalNetWorth) * 100 : 0,
    ])
  );
}

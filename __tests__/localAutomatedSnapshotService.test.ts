import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/types/assets";

vi.mock("server-only", () => ({}));

const {
  invalidateLocalDashboardOverviewSummaryMock,
  listLocalAssetsMock,
  localSnapshotExistsMock,
  updateLocalUserAssetPricesMock,
  upsertLocalSnapshotMock,
} = vi.hoisted(() => ({
  invalidateLocalDashboardOverviewSummaryMock: vi.fn(),
  listLocalAssetsMock: vi.fn(),
  localSnapshotExistsMock: vi.fn(),
  updateLocalUserAssetPricesMock: vi.fn(),
  upsertLocalSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/server/assets/localAssetService", () => ({
  listLocalAssets: listLocalAssetsMock,
}));

vi.mock("@/lib/server/dashboard/localDashboardOverviewInvalidationService", () => ({
  invalidateLocalDashboardOverviewSummary: invalidateLocalDashboardOverviewSummaryMock,
}));

vi.mock("@/lib/server/prices/localPriceUpdateService", () => ({
  updateLocalUserAssetPrices: updateLocalUserAssetPricesMock,
}));

vi.mock("@/lib/server/snapshots/localSnapshotService", () => ({
  localSnapshotExists: localSnapshotExistsMock,
  upsertLocalSnapshot: upsertLocalSnapshotMock,
}));

vi.mock("@/lib/utils/dateHelpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/dateHelpers")>(
    "@/lib/utils/dateHelpers"
  );

  return {
    ...actual,
    getItalyMonthYear: vi.fn(() => ({ month: 5, year: 2026 })),
  };
});

import { createLocalAutomatedSnapshot } from "@/lib/server/snapshots/localAutomatedSnapshotService";

const assets = [
  {
    id: "asset-1",
    userId: "user-1",
    ticker: "VWCE",
    name: "Vanguard FTSE All-World",
    type: "etf",
    assetClass: "equity",
    currency: "EUR",
    quantity: 10,
    currentPrice: 100,
    isLiquid: true,
  },
  {
    id: "asset-2",
    userId: "user-1",
    ticker: "HOME",
    name: "Casa",
    type: "realestate",
    assetClass: "realestate",
    currency: "EUR",
    quantity: 1,
    currentPrice: 200000,
    outstandingDebt: 50000,
    isPrimaryResidence: true,
  },
] as Asset[];

describe("local automated snapshot service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    listLocalAssetsMock.mockResolvedValue(assets);
    localSnapshotExistsMock.mockResolvedValue(false);
    updateLocalUserAssetPricesMock.mockResolvedValue({ message: "updated" });
    upsertLocalSnapshotMock.mockResolvedValue({});
    invalidateLocalDashboardOverviewSummaryMock.mockResolvedValue(undefined);
  });

  it("creates a current-month snapshot from local assets", async () => {
    await expect(createLocalAutomatedSnapshot("user-1", {})).resolves.toEqual({
      success: true,
      message: "Snapshot creato con successo",
      snapshotId: "user-1-2026-5",
      data: {
        year: 2026,
        month: 5,
        totalNetWorth: 151000,
        liquidNetWorth: 1000,
        assetsCount: 2,
      },
    });

    expect(updateLocalUserAssetPricesMock).toHaveBeenCalledWith("user-1");
    expect(localSnapshotExistsMock).toHaveBeenCalledWith("user-1", 2026, 5);
    expect(upsertLocalSnapshotMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        year: 2026,
        month: 5,
        totalNetWorth: 151000,
        liquidNetWorth: 1000,
        illiquidNetWorth: 150000,
        fireNetWorth: 1000,
        byAssetClass: {
          equity: 1000,
          realestate: 150000,
        },
        assetAllocation: {
          equity: expect.closeTo(0.6622516556, 8),
          realestate: expect.closeTo(99.3377483443, 8),
        },
      })
    );
    expect(invalidateLocalDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "user-1",
      "snapshot_created"
    );
  });

  it("returns the no-assets response without writing a snapshot", async () => {
    listLocalAssetsMock.mockResolvedValue([]);

    await expect(
      createLocalAutomatedSnapshot("user-1", { year: 2026, month: 4 })
    ).resolves.toEqual({
      success: false,
      message: "No assets found for user",
      snapshotId: null,
    });

    expect(upsertLocalSnapshotMock).not.toHaveBeenCalled();
    expect(invalidateLocalDashboardOverviewSummaryMock).not.toHaveBeenCalled();
  });

  it("updates an existing snapshot and keeps price update failures non-blocking", async () => {
    localSnapshotExistsMock.mockResolvedValue(true);
    updateLocalUserAssetPricesMock.mockRejectedValue(new Error("prices unavailable"));

    await expect(
      createLocalAutomatedSnapshot("user-1", { year: 2026, month: 4 })
    ).resolves.toMatchObject({
      success: true,
      message: "Snapshot aggiornato con successo",
      snapshotId: "user-1-2026-4",
    });

    expect(upsertLocalSnapshotMock).toHaveBeenCalled();
    expect(invalidateLocalDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "user-1",
      "snapshot_overwritten"
    );
    expect(console.error).toHaveBeenCalledWith(
      "[LOCAL_AUTOMATED_SNAPSHOT_PRICE_UPDATE_ERROR]",
      expect.any(Error)
    );
  });
});

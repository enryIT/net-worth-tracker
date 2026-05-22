import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  invalidateLocalDashboardOverviewSummaryMock,
  updateLocalHallOfFameMock,
  upsertLocalSnapshotMock,
} = vi.hoisted(() => ({
  invalidateLocalDashboardOverviewSummaryMock: vi.fn(),
  updateLocalHallOfFameMock: vi.fn(),
  upsertLocalSnapshotMock: vi.fn(),
}));

vi.mock("@/lib/server/dashboard/localDashboardOverviewInvalidationService", () => ({
  invalidateLocalDashboardOverviewSummary: invalidateLocalDashboardOverviewSummaryMock,
}));

vi.mock("@/lib/server/hall-of-fame/localHallOfFameService", () => ({
  updateLocalHallOfFame: updateLocalHallOfFameMock,
}));

vi.mock("@/lib/server/snapshots/localSnapshotService", () => ({
  upsertLocalSnapshot: upsertLocalSnapshotMock,
}));

import { createLocalManualSnapshot } from "@/lib/server/snapshots/localManualSnapshotService";

const manualSnapshotInput = {
  year: 2026,
  month: 5,
  totalNetWorth: 110000,
  liquidNetWorth: 90000,
  illiquidNetWorth: 20000,
  byAssetClass: { equity: 90000, realestate: 20000 },
  byAsset: [],
  byOwnershipProfile: {
    family: {
      profileName: "Famiglia",
      totalValue: 110000,
    },
  },
  byParticipant: {
    enrico: {
      participantName: "Enrico",
      totalValue: 110000,
    },
  },
  assetAllocation: { equity: 81.82, realestate: 18.18 },
};

describe("local manual snapshot service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    upsertLocalSnapshotMock.mockResolvedValue({
      ...manualSnapshotInput,
      userId: "user-1",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    });
    invalidateLocalDashboardOverviewSummaryMock.mockResolvedValue(undefined);
    updateLocalHallOfFameMock.mockResolvedValue(undefined);
  });

  it("creates the manual snapshot in Postgres and invalidates dependent summaries", async () => {
    await expect(
      createLocalManualSnapshot("user-1", manualSnapshotInput)
    ).resolves.toEqual({
      success: true,
      snapshotId: "user-1-2026-5",
      message: "Snapshot manuale creato correttamente.",
    });

    expect(upsertLocalSnapshotMock).toHaveBeenCalledWith("user-1", {
      ...manualSnapshotInput,
      byAsset: [],
    });
    expect(invalidateLocalDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "user-1",
      "manual_snapshot_created"
    );
    expect(updateLocalHallOfFameMock).toHaveBeenCalledWith("user-1");
  });

  it("keeps the snapshot successful when Hall of Fame recalculation fails", async () => {
    updateLocalHallOfFameMock.mockRejectedValue(new Error("ranking unavailable"));

    await expect(
      createLocalManualSnapshot("user-1", manualSnapshotInput)
    ).resolves.toMatchObject({
      success: true,
      snapshotId: "user-1-2026-5",
    });

    expect(updateLocalHallOfFameMock).toHaveBeenCalledWith("user-1");
    expect(console.error).toHaveBeenCalledWith(
      "[LOCAL_MANUAL_SNAPSHOT_HALL_OF_FAME_ERROR]",
      expect.any(Error)
    );
  });
});

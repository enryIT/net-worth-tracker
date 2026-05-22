import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  createLocalAutomatedSnapshotMock,
  prismaMock,
  updateLocalHallOfFameMock,
} = vi.hoisted(() => ({
  createLocalAutomatedSnapshotMock: vi.fn(),
  prismaMock: {
    user: {
      findMany: vi.fn(),
    },
  },
  updateLocalHallOfFameMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/server/snapshots/localAutomatedSnapshotService", () => ({
  createLocalAutomatedSnapshot: createLocalAutomatedSnapshotMock,
}));

vi.mock("@/lib/server/hall-of-fame/localHallOfFameService", () => ({
  updateLocalHallOfFame: updateLocalHallOfFameMock,
}));

import { runLocalMonthlySnapshotCron } from "@/lib/server/snapshots/localMonthlySnapshotCronService";

describe("local monthly snapshot cron service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1", isDemo: false },
      { id: "user-2", isDemo: false },
    ]);
    createLocalAutomatedSnapshotMock.mockResolvedValue({
      success: true,
      snapshotId: "user-1-2026-5",
      message: "Snapshot creato con successo",
    });
    updateLocalHallOfFameMock.mockResolvedValue(undefined);
  });

  it("creates snapshots for every local user and updates Hall of Fame after successes", async () => {
    const result = await runLocalMonthlySnapshotCron();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      select: { id: true, isDemo: true },
      orderBy: { createdAt: "asc" },
    });
    expect(createLocalAutomatedSnapshotMock).toHaveBeenCalledWith("user-1", {});
    expect(createLocalAutomatedSnapshotMock).toHaveBeenCalledWith("user-2", {});
    expect(updateLocalHallOfFameMock).toHaveBeenCalledWith("user-1");
    expect(updateLocalHallOfFameMock).toHaveBeenCalledWith("user-2");
    expect(result).toMatchObject({
      success: true,
      message: "Monthly snapshots job completed",
      snapshotsCreated: 2,
      errors: 0,
      results: [
        {
          userId: "user-1",
          snapshotId: "user-1-2026-5",
          message: "Snapshot creato con successo",
        },
        {
          userId: "user-2",
          snapshotId: "user-1-2026-5",
          message: "Snapshot creato con successo",
        },
      ],
      errorDetails: [],
      emailSummary: { sent: 0, skipped: 0, errors: 0 },
      quarterlyEmailSummary: { sent: 0, skipped: 0, errors: 0 },
      yearlyEmailSummary: { sent: 0, skipped: 0, errors: 0 },
    });
    expect(result.timestamp).toEqual(expect.any(String));
  });

  it("keeps processing when one snapshot fails", async () => {
    createLocalAutomatedSnapshotMock
      .mockRejectedValueOnce(new Error("snapshot unavailable"))
      .mockResolvedValueOnce({
        success: true,
        snapshotId: "user-2-2026-5",
        message: "Snapshot creato con successo",
      });

    const result = await runLocalMonthlySnapshotCron();

    expect(createLocalAutomatedSnapshotMock).toHaveBeenCalledTimes(2);
    expect(updateLocalHallOfFameMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      snapshotsCreated: 1,
      errors: 1,
      errorDetails: [
        {
          userId: "user-1",
          error: "snapshot unavailable",
        },
      ],
    });
  });

  it("keeps successful snapshots when Hall of Fame recalculation fails", async () => {
    updateLocalHallOfFameMock.mockRejectedValue(new Error("ranking unavailable"));

    const result = await runLocalMonthlySnapshotCron();

    expect(result.snapshotsCreated).toBe(2);
    expect(result.errors).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      "[LOCAL_MONTHLY_SNAPSHOT_HALL_OF_FAME_ERROR]",
      expect.objectContaining({ userId: "user-1" }),
      expect.any(Error)
    );
  });

  it("returns an empty success result when no users exist", async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await expect(runLocalMonthlySnapshotCron()).resolves.toMatchObject({
      success: true,
      message: "No users found",
      snapshotsCreated: 0,
      errors: 0,
    });
  });
});

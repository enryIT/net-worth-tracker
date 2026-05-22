import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    monthlySnapshot: {
      count: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  listLocalSnapshots,
  localSnapshotExists,
  upsertLocalSnapshot,
} from "@/lib/server/snapshots/localSnapshotService";

describe("local snapshot service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists snapshots scoped to a user in chronological order", async () => {
    prismaMock.monthlySnapshot.findMany.mockResolvedValue([
      {
        id: "snapshot-1",
        userId: "user-1",
        year: 2026,
        month: 4,
        isDummy: false,
        totalNetWorth: 100000,
        liquidNetWorth: 80000,
        illiquidNetWorth: 20000,
        fireNetWorth: 75000,
        byAssetClass: { equity: 80000, realestate: 20000 },
        byAsset: [],
        byOwnershipProfile: {},
        byParticipant: {},
        assetAllocation: { equity: 80, realestate: 20 },
        note: null,
        legacyFirebaseId: null,
        createdAt: new Date("2026-04-30T20:00:00.000Z"),
        updatedAt: new Date("2026-04-30T20:00:00.000Z"),
      },
    ]);

    const snapshots = await listLocalSnapshots("user-1");

    expect(prismaMock.monthlySnapshot.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    expect(snapshots[0]).toMatchObject({
      userId: "user-1",
      year: 2026,
      month: 4,
      totalNetWorth: 100000,
      byAssetClass: { equity: 80000, realestate: 20000 },
    });
  });

  it("upserts one user-scoped snapshot per month", async () => {
    prismaMock.monthlySnapshot.upsert.mockResolvedValue({
      id: "snapshot-1",
      userId: "user-1",
      year: 2026,
      month: 5,
      isDummy: false,
      totalNetWorth: 110000,
      liquidNetWorth: 90000,
      illiquidNetWorth: 20000,
      fireNetWorth: null,
      byAssetClass: { equity: 90000, realestate: 20000 },
      byAsset: [],
      byOwnershipProfile: {},
      byParticipant: {},
      assetAllocation: { equity: 81.82, realestate: 18.18 },
      note: "Chiusura mese",
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-31T20:00:00.000Z"),
      updatedAt: new Date("2026-05-31T20:00:00.000Z"),
    });

    const snapshot = await upsertLocalSnapshot("user-1", {
      year: 2026,
      month: 5,
      totalNetWorth: 110000,
      liquidNetWorth: 90000,
      illiquidNetWorth: 20000,
      byAssetClass: { equity: 90000, realestate: 20000 },
      byAsset: [],
      assetAllocation: { equity: 81.82, realestate: 18.18 },
      note: "Chiusura mese",
    });

    expect(prismaMock.monthlySnapshot.upsert).toHaveBeenCalledWith({
      where: {
        userId_year_month: {
          userId: "user-1",
          year: 2026,
          month: 5,
        },
      },
      create: {
        userId: "user-1",
        year: 2026,
        month: 5,
        isDummy: false,
        totalNetWorth: 110000,
        liquidNetWorth: 90000,
        illiquidNetWorth: 20000,
        fireNetWorth: undefined,
        byAssetClass: { equity: 90000, realestate: 20000 },
        byAsset: [],
        byOwnershipProfile: {},
        byParticipant: {},
        assetAllocation: { equity: 81.82, realestate: 18.18 },
        note: "Chiusura mese",
      },
      update: {
        isDummy: false,
        totalNetWorth: 110000,
        liquidNetWorth: 90000,
        illiquidNetWorth: 20000,
        fireNetWorth: undefined,
        byAssetClass: { equity: 90000, realestate: 20000 },
        byAsset: [],
        byOwnershipProfile: {},
        byParticipant: {},
        assetAllocation: { equity: 81.82, realestate: 18.18 },
        note: "Chiusura mese",
      },
    });
    expect(snapshot.month).toBe(5);
  });

  it("checks whether a user-scoped snapshot already exists for a period", async () => {
    prismaMock.monthlySnapshot.count.mockResolvedValue(1);

    await expect(localSnapshotExists("user-1", 2026, 5)).resolves.toBe(true);

    expect(prismaMock.monthlySnapshot.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        year: 2026,
        month: 5,
      },
    });
  });
});

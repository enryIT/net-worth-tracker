import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type { MonthlySnapshot } from "@/types/assets";

export type LocalSnapshotInput = {
  year: number;
  month: number;
  isDummy?: boolean;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  fireNetWorth?: number;
  byAssetClass: Record<string, number>;
  byAsset: MonthlySnapshot["byAsset"];
  byOwnershipProfile?: MonthlySnapshot["byOwnershipProfile"];
  byParticipant?: MonthlySnapshot["byParticipant"];
  assetAllocation: Record<string, number>;
  note?: string;
};

type LocalSnapshotRow = {
  userId: string;
  year: number;
  month: number;
  isDummy: boolean;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  fireNetWorth: number | null;
  byAssetClass: Prisma.JsonValue;
  byAsset: Prisma.JsonValue;
  byOwnershipProfile: Prisma.JsonValue;
  byParticipant: Prisma.JsonValue;
  assetAllocation: Prisma.JsonValue;
  note: string | null;
  createdAt: Date;
};

export async function listLocalSnapshots(
  userId: string
): Promise<MonthlySnapshot[]> {
  const rows = await prisma.monthlySnapshot.findMany({
    where: { userId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  return rows.map(mapSnapshotRow);
}

export async function localSnapshotExists(
  userId: string,
  year: number,
  month: number
): Promise<boolean> {
  const count = await prisma.monthlySnapshot.count({
    where: {
      userId,
      year,
      month,
    },
  });

  return count > 0;
}

export async function upsertLocalSnapshot(
  userId: string,
  snapshot: LocalSnapshotInput
): Promise<MonthlySnapshot> {
  const data = buildSnapshotData(userId, snapshot);
  const row = await prisma.monthlySnapshot.upsert({
    where: {
      userId_year_month: {
        userId,
        year: snapshot.year,
        month: snapshot.month,
      },
    },
    create: data,
    update: omitUserAndPeriod(data),
  });

  return mapSnapshotRow(row);
}

function buildSnapshotData(
  userId: string,
  snapshot: LocalSnapshotInput
): Prisma.MonthlySnapshotUncheckedCreateInput {
  return {
    userId,
    year: snapshot.year,
    month: snapshot.month,
    isDummy: snapshot.isDummy ?? false,
    totalNetWorth: snapshot.totalNetWorth,
    liquidNetWorth: snapshot.liquidNetWorth,
    illiquidNetWorth: snapshot.illiquidNetWorth,
    fireNetWorth: snapshot.fireNetWorth,
    byAssetClass: snapshot.byAssetClass,
    byAsset: snapshot.byAsset as unknown as Prisma.InputJsonValue,
    byOwnershipProfile: (snapshot.byOwnershipProfile ?? {}) as Prisma.InputJsonValue,
    byParticipant: (snapshot.byParticipant ?? {}) as Prisma.InputJsonValue,
    assetAllocation: snapshot.assetAllocation,
    note: snapshot.note,
  };
}

function omitUserAndPeriod(
  data: Prisma.MonthlySnapshotUncheckedCreateInput
): Prisma.MonthlySnapshotUncheckedUpdateInput {
  return {
    isDummy: data.isDummy,
    totalNetWorth: data.totalNetWorth,
    liquidNetWorth: data.liquidNetWorth,
    illiquidNetWorth: data.illiquidNetWorth,
    fireNetWorth: data.fireNetWorth,
    byAssetClass: data.byAssetClass,
    byAsset: data.byAsset,
    byOwnershipProfile: data.byOwnershipProfile,
    byParticipant: data.byParticipant,
    assetAllocation: data.assetAllocation,
    note: data.note,
  };
}

function mapSnapshotRow(row: LocalSnapshotRow): MonthlySnapshot {
  return {
    userId: row.userId,
    year: row.year,
    month: row.month,
    isDummy: row.isDummy,
    totalNetWorth: row.totalNetWorth,
    liquidNetWorth: row.liquidNetWorth,
    illiquidNetWorth: row.illiquidNetWorth,
    fireNetWorth: row.fireNetWorth ?? undefined,
    byAssetClass: mapNumberRecord(row.byAssetClass),
    byAsset: Array.isArray(row.byAsset)
      ? (row.byAsset as unknown as MonthlySnapshot["byAsset"])
      : [],
    byOwnershipProfile: isRecord(row.byOwnershipProfile)
      ? (row.byOwnershipProfile as MonthlySnapshot["byOwnershipProfile"])
      : {},
    byParticipant: isRecord(row.byParticipant)
      ? (row.byParticipant as MonthlySnapshot["byParticipant"])
      : {},
    assetAllocation: mapNumberRecord(row.assetAllocation),
    createdAt: row.createdAt,
    note: row.note ?? undefined,
  };
}

function mapNumberRecord(input: Prisma.JsonValue): Record<string, number> {
  if (!isRecord(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, number] => {
      const [, value] = entry;
      return typeof value === "number";
    })
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

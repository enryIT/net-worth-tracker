import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { calculateInternalTransferEffect } from "@/lib/utils/investmentOperationUtils";
import type {
  InternalTransfer,
  InternalTransferFormData,
} from "@/types/investments";

type CashAssetRow = {
  id: string;
  userId: string;
  name: string;
  assetClass: string;
  currency: string;
  quantity: number;
};

type InternalTransferRow = {
  id: string;
  userId: string;
  fromCashAssetId: string;
  fromCashAssetName: string;
  toCashAssetId: string;
  toCashAssetName: string;
  amount: number;
  currency: string;
  date: Date;
  fees: number | null;
  purpose: string | null;
  notes: string | null;
  linkedExpenseId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listLocalInternalTransfers(
  userId: string
): Promise<InternalTransfer[]> {
  const rows = await prisma.internalTransfer.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(mapInternalTransferRow);
}

export async function createLocalInternalTransfer(
  userId: string,
  input: InternalTransferFormData
): Promise<InternalTransfer> {
  assertTransferInput(input);
  const fees = input.fees ?? 0;

  return prisma.$transaction(async (tx) => {
    const assets = await getCashAssetsForTransfer(tx, userId, [
      input.fromCashAssetId,
      input.toCashAssetId,
    ]);
    const fromAsset = assets.get(input.fromCashAssetId);
    const toAsset = assets.get(input.toCashAssetId);

    if (!fromAsset || !toAsset) {
      throw new Error("Transfer assets must be cash assets owned by the authenticated user");
    }

    const { fromCashDelta, toCashDelta } = calculateInternalTransferEffect(
      input.amount,
      fees
    );

    await tx.asset.update({
      where: { id_userId: { id: fromAsset.id, userId } },
      data: { quantity: { decrement: Math.abs(fromCashDelta) } },
    });
    await tx.asset.update({
      where: { id_userId: { id: toAsset.id, userId } },
      data: { quantity: { increment: toCashDelta } },
    });

    const row = await tx.internalTransfer.create({
      data: buildTransferCreateData(userId, input, fromAsset, toAsset, fees),
    });

    return mapInternalTransferRow(row);
  });
}

export async function updateLocalInternalTransfer(
  userId: string,
  transferId: string,
  input: InternalTransferFormData
): Promise<InternalTransfer | null> {
  assertTransferInput(input);
  const nextFees = input.fees ?? 0;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.internalTransfer.findUnique({
      where: { id_userId: { id: transferId, userId } },
    });

    if (!existing) {
      return null;
    }

    const assetIds = Array.from(
      new Set([
        existing.fromCashAssetId,
        existing.toCashAssetId,
        input.fromCashAssetId,
        input.toCashAssetId,
      ])
    );
    const assets = await getCashAssetsForTransfer(tx, userId, assetIds);

    if (assets.size !== assetIds.length) {
      throw new Error("Transfer assets must be cash assets owned by the authenticated user");
    }

    const deltas = new Map<string, number>();
    addDelta(deltas, existing.fromCashAssetId, existing.amount + (existing.fees ?? 0));
    addDelta(deltas, existing.toCashAssetId, -existing.amount);
    addDelta(deltas, input.fromCashAssetId, -(input.amount + nextFees));
    addDelta(deltas, input.toCashAssetId, input.amount);

    for (const [assetId, delta] of deltas) {
      if (Math.abs(delta) < 0.000001) continue;
      await tx.asset.update({
        where: { id_userId: { id: assetId, userId } },
        data: {
          quantity: delta > 0
            ? { increment: delta }
            : { decrement: Math.abs(delta) },
        },
      });
    }

    const fromAsset = assets.get(input.fromCashAssetId);
    const toAsset = assets.get(input.toCashAssetId);
    if (!fromAsset || !toAsset) {
      throw new Error("Transfer assets must be cash assets owned by the authenticated user");
    }

    const row = await tx.internalTransfer.update({
      where: { id_userId: { id: transferId, userId } },
      data: buildTransferUpdateData(input, fromAsset, toAsset, nextFees),
    });

    return mapInternalTransferRow(row);
  });
}

export async function deleteLocalInternalTransfer(
  userId: string,
  transferId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.internalTransfer.findUnique({
      where: { id_userId: { id: transferId, userId } },
    });

    if (!existing) {
      return false;
    }

    const assets = await getCashAssetsForTransfer(tx, userId, [
      existing.fromCashAssetId,
      existing.toCashAssetId,
    ]);

    if (assets.size !== 2) {
      throw new Error("Transfer assets are no longer valid cash assets");
    }

    await tx.asset.update({
      where: { id_userId: { id: existing.fromCashAssetId, userId } },
      data: {
        quantity: { increment: existing.amount + (existing.fees ?? 0) },
      },
    });
    await tx.asset.update({
      where: { id_userId: { id: existing.toCashAssetId, userId } },
      data: { quantity: { decrement: existing.amount } },
    });

    const result = await tx.internalTransfer.deleteMany({
      where: { id: transferId, userId },
    });

    return result.count > 0;
  });
}

function assertTransferInput(input: InternalTransferFormData): void {
  calculateInternalTransferEffect(input.amount, input.fees ?? 0);

  if (input.fromCashAssetId === input.toCashAssetId) {
    throw new Error("Source and destination cash assets must be different");
  }
}

async function getCashAssetsForTransfer(
  tx: Prisma.TransactionClient,
  userId: string,
  assetIds: string[]
): Promise<Map<string, CashAssetRow>> {
  const rows = await tx.asset.findMany({
    where: {
      userId,
      id: { in: assetIds },
      assetClass: "cash",
    },
  });

  return new Map(rows.map((row) => [row.id, row]));
}

function buildTransferCreateData(
  userId: string,
  input: InternalTransferFormData,
  fromAsset: CashAssetRow,
  toAsset: CashAssetRow,
  fees: number
) {
  return {
    userId,
    ...buildTransferData(input, fromAsset, toAsset, fees),
  };
}

function buildTransferUpdateData(
  input: InternalTransferFormData,
  fromAsset: CashAssetRow,
  toAsset: CashAssetRow,
  fees: number
) {
  return buildTransferData(input, fromAsset, toAsset, fees);
}

function buildTransferData(
  input: InternalTransferFormData,
  fromAsset: CashAssetRow,
  toAsset: CashAssetRow,
  fees: number
) {
  return {
    fromCashAssetId: fromAsset.id,
    fromCashAssetName: fromAsset.name,
    toCashAssetId: toAsset.id,
    toCashAssetName: toAsset.name,
    amount: input.amount,
    currency: input.currency || fromAsset.currency || "EUR",
    date: input.date,
    fees,
    purpose: input.purpose ?? "neutral_transfer",
    notes: input.notes,
    linkedExpenseId: input.linkedExpenseId,
  };
}

function addDelta(deltas: Map<string, number>, assetId: string, delta: number): void {
  deltas.set(assetId, (deltas.get(assetId) ?? 0) + delta);
}

function mapInternalTransferRow(row: InternalTransferRow): InternalTransfer {
  return {
    id: row.id,
    userId: row.userId,
    fromCashAssetId: row.fromCashAssetId,
    fromCashAssetName: row.fromCashAssetName,
    toCashAssetId: row.toCashAssetId,
    toCashAssetName: row.toCashAssetName,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    fees: row.fees ?? undefined,
    purpose: row.purpose as InternalTransfer["purpose"],
    notes: row.notes ?? undefined,
    linkedExpenseId: row.linkedExpenseId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

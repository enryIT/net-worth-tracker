import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { calculateInvestmentOperationEffect } from "@/lib/utils/investmentOperationUtils";
import type {
  InvestmentOperation,
  InvestmentOperationFormData,
  RealizedInvestmentSummary,
} from "@/types/investments";

type AssetRow = {
  id: string;
  userId: string;
  ticker: string;
  name: string;
  assetClass: string;
  currency: string;
  quantity: number;
  metadata: Prisma.JsonValue;
};

type InvestmentOperationRow = {
  id: string;
  userId: string;
  assetId: string;
  assetName: string;
  assetTicker: string;
  type: string;
  date: Date;
  quantity: number;
  pricePerUnit: number;
  grossAmount: number;
  fees: number;
  taxes: number;
  currency: string;
  cashAssetId: string | null;
  cashAssetName: string | null;
  linkedExpenseId: string | null;
  notes: string | null;
  previousQuantity: number;
  previousAverageCost: number | null;
  resultingQuantity: number;
  resultingAverageCost: number | null;
  realizedGain: number | null;
  realizedGainTax: number | null;
  netCashEffect: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function listLocalInvestmentOperations(
  userId: string
): Promise<InvestmentOperation[]> {
  const rows = await prisma.investmentOperation.findMany({
    where: { userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return rows.map(mapInvestmentOperationRow);
}

export async function createLocalInvestmentOperation(
  userId: string,
  input: InvestmentOperationFormData
): Promise<InvestmentOperation> {
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({
      where: { id_userId: { id: input.assetId, userId } },
    });

    if (!asset) {
      throw new Error("Asset not found");
    }
    if (asset.assetClass === "cash") {
      throw new Error("Use internal transfers or cashflow entries for cash assets");
    }

    const previousQuantity = asset.quantity || 0;
    const previousAverageCost = getAverageCost(asset.metadata);
    const fees = input.fees ?? 0;
    const taxes = input.taxes ?? 0;
    const effect = calculateInvestmentOperationEffect({
      type: input.type,
      previousQuantity,
      previousAverageCost,
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      fees,
      taxes,
    });

    let cashAsset: AssetRow | null = null;
    if (input.cashAssetId && Math.abs(effect.netCashEffect) > 0.000001) {
      cashAsset = await tx.asset.findUnique({
        where: { id_userId: { id: input.cashAssetId, userId } },
      });

      if (!cashAsset || cashAsset.assetClass !== "cash") {
        throw new Error("Cash asset does not belong to the authenticated user");
      }
    }

    await tx.asset.update({
      where: { id_userId: { id: asset.id, userId } },
      data: {
        quantity: effect.resultingQuantity,
        metadata: buildAssetMetadata(asset.metadata, effect.resultingAverageCost),
      },
    });

    if (cashAsset) {
      await tx.asset.update({
        where: { id_userId: { id: cashAsset.id, userId } },
        data: { quantity: { increment: effect.netCashEffect } },
      });
    }

    const row = await tx.investmentOperation.create({
      data: {
        userId,
        assetId: asset.id,
        assetName: asset.name,
        assetTicker: asset.ticker,
        type: input.type,
        date: input.date,
        quantity: input.quantity,
        pricePerUnit: input.pricePerUnit,
        grossAmount: effect.grossAmount,
        fees,
        taxes,
        currency: input.currency || asset.currency || "EUR",
        cashAssetId: input.cashAssetId,
        cashAssetName: cashAsset?.name,
        linkedExpenseId: input.linkedExpenseId,
        notes: input.notes,
        previousQuantity,
        previousAverageCost,
        resultingQuantity: effect.resultingQuantity,
        resultingAverageCost: effect.resultingAverageCost,
        realizedGain: effect.realizedGain,
        realizedGainTax: effect.realizedGainTax,
        netCashEffect: effect.netCashEffect,
      },
    });

    return mapInvestmentOperationRow(row);
  });
}

export async function updateLocalInvestmentOperation(
  userId: string,
  operationId: string,
  input: InvestmentOperationFormData
): Promise<InvestmentOperation | null> {
  return prisma.$transaction(async (tx) => {
    const operation = await tx.investmentOperation.findUnique({
      where: { id_userId: { id: operationId, userId } },
    });

    if (!operation) {
      return null;
    }
    if (operation.assetId !== input.assetId) {
      throw new Error("Changing the linked asset is not supported. Delete and recreate the operation.");
    }

    const asset = await tx.asset.findUnique({
      where: { id_userId: { id: operation.assetId, userId } },
    });

    if (!asset || asset.assetClass === "cash") {
      throw new Error("Asset does not belong to the operation owner");
    }
    if (Math.abs((asset.quantity || 0) - operation.resultingQuantity) > 0.000001) {
      throw new Error("Cannot update operation because the asset changed after it was recorded");
    }

    const fees = input.fees ?? 0;
    const taxes = input.taxes ?? 0;
    const effect = calculateInvestmentOperationEffect({
      type: input.type,
      previousQuantity: operation.previousQuantity,
      previousAverageCost: operation.previousAverageCost ?? undefined,
      quantity: input.quantity,
      pricePerUnit: input.pricePerUnit,
      fees,
      taxes,
    });

    const cashAssets = await getCashAssetsById(tx, userId, [
      operation.cashAssetId,
      input.cashAssetId,
    ]);

    await tx.asset.update({
      where: { id_userId: { id: asset.id, userId } },
      data: {
        quantity: effect.resultingQuantity,
        metadata: buildAssetMetadata(asset.metadata, effect.resultingAverageCost),
      },
    });

    for (const cashAssetId of cashAssets.keys()) {
      const oldDelta = operation.cashAssetId === cashAssetId ? -operation.netCashEffect : 0;
      const newDelta = input.cashAssetId === cashAssetId ? effect.netCashEffect : 0;
      const delta = oldDelta + newDelta;
      if (Math.abs(delta) < 0.000001) continue;

      await tx.asset.update({
        where: { id_userId: { id: cashAssetId, userId } },
        data: { quantity: { increment: delta } },
      });
    }

    const cashAsset = input.cashAssetId ? cashAssets.get(input.cashAssetId) : undefined;
    if (input.cashAssetId && !cashAsset) {
      throw new Error("Cash asset does not belong to the operation owner");
    }

    const row = await tx.investmentOperation.update({
      where: { id_userId: { id: operationId, userId } },
      data: {
        type: input.type,
        date: input.date,
        quantity: input.quantity,
        pricePerUnit: input.pricePerUnit,
        grossAmount: effect.grossAmount,
        fees,
        taxes,
        currency: input.currency || asset.currency || "EUR",
        cashAssetId: input.cashAssetId,
        cashAssetName: cashAsset?.name,
        linkedExpenseId: input.linkedExpenseId,
        notes: input.notes,
        resultingQuantity: effect.resultingQuantity,
        resultingAverageCost: effect.resultingAverageCost,
        realizedGain: effect.realizedGain,
        realizedGainTax: effect.realizedGainTax,
        netCashEffect: effect.netCashEffect,
      },
    });

    return mapInvestmentOperationRow(row);
  });
}

export async function deleteLocalInvestmentOperation(
  userId: string,
  operationId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const operation = await tx.investmentOperation.findUnique({
      where: { id_userId: { id: operationId, userId } },
    });

    if (!operation) {
      return false;
    }

    const asset = await tx.asset.findUnique({
      where: { id_userId: { id: operation.assetId, userId } },
    });

    if (!asset || asset.assetClass === "cash") {
      throw new Error("Asset does not belong to the operation owner");
    }
    if (Math.abs((asset.quantity || 0) - operation.resultingQuantity) > 0.000001) {
      throw new Error("Cannot delete operation because the asset changed after it was recorded");
    }

    await tx.asset.update({
      where: { id_userId: { id: asset.id, userId } },
      data: {
        quantity: operation.previousQuantity,
        metadata: buildAssetMetadata(
          asset.metadata,
          operation.previousAverageCost ?? undefined
        ),
      },
    });

    if (operation.cashAssetId && Math.abs(operation.netCashEffect) > 0.000001) {
      const cashAsset = await tx.asset.findUnique({
        where: { id_userId: { id: operation.cashAssetId, userId } },
      });

      if (!cashAsset || cashAsset.assetClass !== "cash") {
        throw new Error("Cash asset does not belong to the operation owner");
      }

      await tx.asset.update({
        where: { id_userId: { id: operation.cashAssetId, userId } },
        data: { quantity: { increment: -operation.netCashEffect } },
      });
    }

    const result = await tx.investmentOperation.deleteMany({
      where: { id: operationId, userId },
    });

    return result.count > 0;
  });
}

export async function getLocalRealizedInvestmentSummary(
  userId: string
): Promise<RealizedInvestmentSummary> {
  const operations = await listLocalInvestmentOperations(userId);
  const sells = operations.filter(
    (operation) => operation.type === "sell" || operation.type === "withdrawal"
  );
  const byAssetMap = new Map<string, RealizedInvestmentSummary["byAsset"][number]>();

  for (const operation of sells) {
    const realizedGain = operation.realizedGain ?? 0;
    const realizedTaxes = operation.realizedGainTax ?? operation.taxes ?? 0;
    const current = byAssetMap.get(operation.assetId) ?? {
      assetId: operation.assetId,
      assetName: operation.assetName,
      assetTicker: operation.assetTicker,
      realizedGain: 0,
      realizedTaxes: 0,
      netRealizedGain: 0,
      sellsCount: 0,
    };

    current.realizedGain += realizedGain;
    current.realizedTaxes += realizedTaxes;
    current.netRealizedGain += realizedGain - realizedTaxes;
    current.sellsCount += 1;
    byAssetMap.set(operation.assetId, current);
  }

  const byAsset = Array.from(byAssetMap.values()).sort(
    (a, b) => b.netRealizedGain - a.netRealizedGain
  );
  const totalRealizedGain = byAsset.reduce((sum, item) => sum + item.realizedGain, 0);
  const totalRealizedTaxes = byAsset.reduce((sum, item) => sum + item.realizedTaxes, 0);

  return {
    totalRealizedGain,
    totalRealizedTaxes,
    totalNetRealizedGain: totalRealizedGain - totalRealizedTaxes,
    sellsCount: sells.length,
    byAsset,
  };
}

function getAverageCost(metadata: Prisma.JsonValue): number | undefined {
  if (!isRecord(metadata)) return undefined;
  return typeof metadata.averageCost === "number" ? metadata.averageCost : undefined;
}

function buildAssetMetadata(
  metadata: Prisma.JsonValue,
  averageCost: number | undefined
): Prisma.InputJsonObject {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {};

  if (averageCost === undefined) {
    delete nextMetadata.averageCost;
  } else {
    nextMetadata.averageCost = averageCost;
  }

  return nextMetadata as Prisma.InputJsonObject;
}

async function getCashAssetsById(
  tx: Prisma.TransactionClient,
  userId: string,
  assetIds: Array<string | null | undefined>
): Promise<Map<string, AssetRow>> {
  const uniqueIds = Array.from(
    new Set(assetIds.filter((assetId): assetId is string => Boolean(assetId)))
  );
  const assets = new Map<string, AssetRow>();

  for (const assetId of uniqueIds) {
    const asset = await tx.asset.findUnique({
      where: { id_userId: { id: assetId, userId } },
    });

    if (!asset || asset.assetClass !== "cash") {
      continue;
    }

    assets.set(asset.id, asset);
  }

  return assets;
}

function mapInvestmentOperationRow(row: InvestmentOperationRow): InvestmentOperation {
  return {
    id: row.id,
    userId: row.userId,
    assetId: row.assetId,
    assetName: row.assetName,
    assetTicker: row.assetTicker,
    type: row.type as InvestmentOperation["type"],
    date: row.date,
    quantity: row.quantity,
    pricePerUnit: row.pricePerUnit,
    grossAmount: row.grossAmount,
    fees: row.fees,
    taxes: row.taxes,
    currency: row.currency,
    cashAssetId: row.cashAssetId ?? undefined,
    cashAssetName: row.cashAssetName ?? undefined,
    linkedExpenseId: row.linkedExpenseId ?? undefined,
    notes: row.notes ?? undefined,
    previousQuantity: row.previousQuantity,
    previousAverageCost: row.previousAverageCost ?? undefined,
    resultingQuantity: row.resultingQuantity,
    resultingAverageCost: row.resultingAverageCost ?? undefined,
    realizedGain: row.realizedGain ?? undefined,
    realizedGainTax: row.realizedGainTax ?? undefined,
    netCashEffect: row.netCashEffect,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

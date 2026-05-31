import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type { Asset, AssetFormData } from "@/types/assets";

type LocalBondDetailsInput = Omit<
  NonNullable<AssetFormData["bondDetails"]>,
  "issueDate" | "maturityDate"
> & {
  issueDate: string | Date;
  maturityDate: string | Date;
};

type LocalAssetFormInput = Omit<AssetFormData, "bondDetails"> & {
  bondDetails?: LocalBondDetailsInput;
};

type LocalAssetRow = {
  id: string;
  userId: string;
  ticker: string;
  name: string;
  type: string;
  assetClass: string;
  subCategory: string | null;
  currency: string;
  quantity: number;
  currentPrice: number;
  currentPriceEur: number | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export async function listLocalAssets(userId: string): Promise<Asset[]> {
  const rows = await prisma.asset.findMany({
    where: { userId },
    orderBy: [{ assetClass: "asc" }, { name: "asc" }],
  });

  return rows.map(mapAssetRow);
}

export async function getLocalAssetById(
  userId: string,
  assetId: string
): Promise<Asset | null> {
  const row = await prisma.asset.findUnique({
    where: {
      id_userId: {
        id: assetId,
        userId,
      },
    },
  });

  return row ? mapAssetRow(row) : null;
}

export async function createLocalAsset(
  userId: string,
  assetData: LocalAssetFormInput
): Promise<Asset> {
  const metadata = buildAssetMetadata(assetData);
  const row = await prisma.asset.create({
    data: {
      userId,
      ticker: assetData.ticker,
      name: assetData.name,
      type: assetData.type,
      assetClass: assetData.assetClass,
      subCategory: assetData.subCategory,
      currency: assetData.currency,
      quantity: assetData.quantity,
      currentPrice: assetData.currentPrice,
      currentPriceEur: assetData.currentPriceEur,
      metadata,
    },
  });

  return mapAssetRow(row);
}

export async function updateLocalAsset(
  userId: string,
  assetId: string,
  assetData: LocalAssetFormInput
): Promise<Asset | null> {
  try {
    const row = await prisma.asset.update({
      where: {
        id_userId: {
          id: assetId,
          userId,
        },
      },
      data: buildAssetData(assetData),
    });

    return mapAssetRow(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }

    throw error;
  }
}

export async function deleteLocalAsset(
  userId: string,
  assetId: string
): Promise<boolean> {
  const result = await prisma.asset.deleteMany({
    where: {
      id: assetId,
      userId,
    },
  });

  return result.count > 0;
}

function buildAssetData(assetData: LocalAssetFormInput): Prisma.AssetUncheckedUpdateInput {
  return {
    ticker: assetData.ticker,
    name: assetData.name,
    type: assetData.type,
    assetClass: assetData.assetClass,
    subCategory: assetData.subCategory,
    currency: assetData.currency,
    quantity: assetData.quantity,
    currentPrice: assetData.currentPrice,
    currentPriceEur: assetData.currentPriceEur,
    metadata: buildAssetMetadata(assetData),
  };
}

function mapAssetRow(row: LocalAssetRow): Asset {
  const metadata = isRecord(row.metadata) ? row.metadata : {};

  return {
    id: row.id,
    userId: row.userId,
    ticker: row.ticker,
    name: row.name,
    type: row.type as Asset["type"],
    assetClass: row.assetClass as Asset["assetClass"],
    subCategory: row.subCategory ?? undefined,
    currency: row.currency,
    quantity: row.quantity,
    currentPrice: row.currentPrice,
    currentPriceEur: row.currentPriceEur ?? undefined,
    averageCost: metadata.averageCost as number | undefined,
    taxRate: metadata.taxRate as number | undefined,
    totalExpenseRatio: metadata.totalExpenseRatio as number | undefined,
    stampDutyExempt: metadata.stampDutyExempt as boolean | undefined,
    includeInHistoryTables: metadata.includeInHistoryTables as boolean | undefined,
    isLiquid: metadata.isLiquid as boolean | undefined,
    autoUpdatePrice: metadata.autoUpdatePrice as boolean | undefined,
    composition: metadata.composition as Asset["composition"],
    outstandingDebt: metadata.outstandingDebt as number | undefined,
    isPrimaryResidence: metadata.isPrimaryResidence as boolean | undefined,
    isin: metadata.isin as string | undefined,
    bondDetails: metadata.bondDetails as Asset["bondDetails"],
    pensionFundDetails: metadata.pensionFundDetails as Asset["pensionFundDetails"],
    ownershipProfileId: metadata.ownershipProfileId as string | undefined,
    ownershipProfileName: metadata.ownershipProfileName as string | undefined,
    ownershipSplits: metadata.ownershipSplits as Asset["ownershipSplits"],
    lastPriceUpdate: row.updatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function buildAssetMetadata(assetData: LocalAssetFormInput): Prisma.InputJsonObject {
  return stripUndefined({
    averageCost: assetData.averageCost,
    taxRate: assetData.taxRate,
    totalExpenseRatio: assetData.totalExpenseRatio,
    stampDutyExempt: assetData.stampDutyExempt,
    includeInHistoryTables: assetData.includeInHistoryTables,
    isLiquid: assetData.isLiquid,
    autoUpdatePrice: assetData.autoUpdatePrice,
    composition: assetData.composition,
    outstandingDebt: assetData.outstandingDebt,
    isPrimaryResidence: assetData.isPrimaryResidence,
    isin: assetData.isin,
    bondDetails: assetData.bondDetails,
    pensionFundDetails: assetData.pensionFundDetails,
    ownershipProfileId: assetData.ownershipProfileId,
    ownershipProfileName: assetData.ownershipProfileName,
    ownershipSplits: assetData.ownershipSplits,
  });
}

function stripUndefined(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Prisma.InputJsonObject;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

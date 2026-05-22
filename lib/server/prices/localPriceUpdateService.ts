import "server-only";

import { Prisma } from "@prisma/client";
import { getBondPriceByIsin } from "@/lib/services/borsaItalianaBondScraperService";
import { convertToEur } from "@/lib/services/currencyConversionService";
import {
  getMultipleQuotes,
  getQuote,
  shouldUpdatePrice,
} from "@/lib/services/yahooFinanceService";
import { prisma } from "@/lib/server/prisma";
import type { BondDetails } from "@/types/assets";

export interface LocalPriceUpdateResult {
  updated: number;
  failed: string[];
  message: string;
}

type LocalPriceAssetRow = {
  id: string;
  userId: string;
  ticker: string;
  type: string;
  assetClass: string;
  subCategory: string | null;
  metadata: Prisma.JsonValue;
};

type NormalizedQuote = {
  price: number;
  currency: string;
};

export async function updateLocalUserAssetPrices(
  userId: string
): Promise<LocalPriceUpdateResult> {
  const assets = await prisma.asset.findMany({
    where: { userId },
  });

  if (assets.length === 0) {
    return buildResult(0, []);
  }

  const updatableAssets = assets.filter(isAutoUpdatableAsset);

  if (updatableAssets.length === 0) {
    return buildResult(0, []);
  }

  const bondsWithIsin = updatableAssets.filter(isBondWithIsin);
  const otherAssets = updatableAssets.filter((asset) => !isBondWithIsin(asset));
  const updated: string[] = [];
  const failed: string[] = [];

  for (const bond of bondsWithIsin) {
    const didUpdate = await updateBondPrice(userId, bond);

    if (didUpdate) {
      updated.push(bond.ticker);
    } else {
      failed.push(bond.ticker);
    }
  }

  const tickers = [...new Set(otherAssets.map((asset) => asset.ticker))];
  const quotes = tickers.length > 0 ? await getMultipleQuotes(tickers) : new Map();

  for (const asset of otherAssets) {
    const normalizedQuote = normalizeQuote(quotes.get(asset.ticker));

    if (!normalizedQuote) {
      failed.push(asset.ticker);
      continue;
    }

    const didUpdate = await updateMarketAssetPrice(userId, asset, normalizedQuote);

    if (didUpdate) {
      updated.push(asset.ticker);
    } else {
      failed.push(asset.ticker);
    }
  }

  return buildResult(updated.length, failed);
}

function isAutoUpdatableAsset(asset: LocalPriceAssetRow): boolean {
  if (!shouldUpdatePrice(asset.type, asset.subCategory ?? undefined)) {
    return false;
  }

  const metadata = getMetadata(asset);
  return metadata.autoUpdatePrice !== false;
}

function isBondWithIsin(asset: LocalPriceAssetRow): boolean {
  const metadata = getMetadata(asset);

  return (
    asset.type === "bond" &&
    asset.assetClass === "bonds" &&
    typeof metadata.isin === "string" &&
    metadata.isin.trim().length > 0
  );
}

async function updateBondPrice(
  userId: string,
  bond: LocalPriceAssetRow
): Promise<boolean> {
  const metadata = getMetadata(bond);
  const isin = String(metadata.isin).trim().toUpperCase();
  const bondDetails = getBondDetails(metadata);

  try {
    const bondPrice = await getBondPriceByIsin(isin);

    if (bondPrice.price !== null && bondPrice.price > 0) {
      await updateAssetPrice(userId, bond.id, {
        currentPrice: adjustBondPrice(bondPrice.price, bondDetails),
      });
      return true;
    }

    const quote = await getQuote(bond.ticker);

    if (quote.price !== null && quote.price > 0) {
      await updateAssetPrice(userId, bond.id, {
        currentPrice: adjustBondPrice(quote.price, bondDetails),
      });
      return true;
    }

    return false;
  } catch (error) {
    console.warn("[LOCAL_PRICE_UPDATE_BOND_ERROR]", bond.ticker, error);
    return false;
  }
}

async function updateMarketAssetPrice(
  userId: string,
  asset: LocalPriceAssetRow,
  quote: NormalizedQuote
): Promise<boolean> {
  try {
    const data: Prisma.AssetUncheckedUpdateInput = {
      currentPrice: quote.price,
      currency: quote.currency,
    };

    if (quote.currency !== "EUR") {
      try {
        data.currentPriceEur = await convertToEur(quote.price, quote.currency);
      } catch (error) {
        console.warn("[LOCAL_PRICE_UPDATE_FX_ERROR]", asset.ticker, error);
      }
    }

    await updateAssetPrice(userId, asset.id, data);
    return true;
  } catch (error) {
    console.warn("[LOCAL_PRICE_UPDATE_ASSET_ERROR]", asset.ticker, error);
    return false;
  }
}

async function updateAssetPrice(
  userId: string,
  assetId: string,
  data: Prisma.AssetUncheckedUpdateInput
): Promise<void> {
  await prisma.asset.update({
    where: {
      id_userId: {
        id: assetId,
        userId,
      },
    },
    data,
  });
}

function normalizeQuote(
  quote: { price: number | null; currency: string } | undefined
): NormalizedQuote | null {
  if (!quote || quote.price === null || quote.price <= 0) {
    return null;
  }

  if (quote.currency === "GBp") {
    return {
      price: quote.price / 100,
      currency: "GBP",
    };
  }

  return {
    price: quote.price,
    currency: quote.currency,
  };
}

function adjustBondPrice(price: number, bondDetails: BondDetails | null): number {
  const nominalValue = bondDetails?.nominalValue;
  return nominalValue && nominalValue > 1 ? price * (nominalValue / 100) : price;
}

function getBondDetails(metadata: Record<string, unknown>): BondDetails | null {
  return isRecord(metadata.bondDetails)
    ? (metadata.bondDetails as unknown as BondDetails)
    : null;
}

function getMetadata(asset: LocalPriceAssetRow): Record<string, unknown> {
  return isRecord(asset.metadata) ? asset.metadata : {};
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function buildResult(updated: number, failed: string[]): LocalPriceUpdateResult {
  return {
    updated,
    failed,
    message: `Updated ${updated} assets, ${failed.length} failed`,
  };
}

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  convertToEurMock,
  getBondPriceByIsinMock,
  getMultipleQuotesMock,
  getQuoteMock,
  prismaMock,
} = vi.hoisted(() => ({
  convertToEurMock: vi.fn(),
  getBondPriceByIsinMock: vi.fn(),
  getMultipleQuotesMock: vi.fn(),
  getQuoteMock: vi.fn(),
  prismaMock: {
    asset: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/yahooFinanceService", () => {
  const shouldUpdatePrice = (assetType: string, subCategory?: string) =>
    assetType !== "cash" &&
    assetType !== "realestate" &&
    assetType !== "pensionfund" &&
    subCategory !== "Private Equity";

  return {
    getMultipleQuotes: getMultipleQuotesMock,
    getQuote: getQuoteMock,
    shouldUpdatePrice,
  };
});

vi.mock("@/lib/services/currencyConversionService", () => ({
  convertToEur: convertToEurMock,
}));

vi.mock("@/lib/services/borsaItalianaBondScraperService", () => ({
  getBondPriceByIsin: getBondPriceByIsinMock,
}));

import { updateLocalUserAssetPrices } from "@/lib/server/prices/localPriceUpdateService";

const baseDate = new Date("2026-05-18T10:00:00.000Z");

function createAsset(overrides: Record<string, unknown>) {
  return {
    id: "asset-1",
    userId: "user-1",
    ticker: "VWCE.DE",
    name: "Vanguard FTSE All-World",
    type: "etf",
    assetClass: "equity",
    subCategory: null,
    currency: "EUR",
    quantity: 10,
    currentPrice: 100,
    currentPriceEur: null,
    metadata: {},
    createdAt: baseDate,
    updatedAt: baseDate,
    ...overrides,
  };
}

describe("local price update service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    convertToEurMock.mockResolvedValue(58.5);
    getBondPriceByIsinMock.mockResolvedValue({
      isin: "IT0005672024",
      price: 104.2,
      currency: "EUR",
      priceType: "ultimo",
    });
    getMultipleQuotesMock.mockResolvedValue(
      new Map([
        ["SWDA.L", { ticker: "SWDA.L", price: 4874, currency: "GBp" }],
        ["AAPL", { ticker: "AAPL", price: 190, currency: "USD" }],
      ])
    );
    getQuoteMock.mockResolvedValue({
      ticker: "BTP",
      price: 101,
      currency: "EUR",
    });
    prismaMock.asset.update.mockResolvedValue({});
  });

  it("updates eligible non-bond assets with normalized prices and EUR conversion", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      createAsset({ id: "asset-1", ticker: "SWDA.L", currency: "GBP" }),
      createAsset({ id: "asset-2", ticker: "XEON", assetClass: "cash", type: "cash" }),
      createAsset({ id: "asset-3", ticker: "MANUAL", metadata: { autoUpdatePrice: false } }),
    ]);

    const result = await updateLocalUserAssetPrices("user-1");

    expect(prismaMock.asset.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
    expect(getMultipleQuotesMock).toHaveBeenCalledWith(["SWDA.L"]);
    expect(convertToEurMock).toHaveBeenCalledWith(48.74, "GBP");
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "asset-1",
          userId: "user-1",
        },
      },
      data: {
        currentPrice: 48.74,
        currency: "GBP",
        currentPriceEur: 58.5,
      },
    });
    expect(result).toEqual({
      updated: 1,
      failed: [],
      message: "Updated 1 assets, 0 failed",
    });
  });

  it("updates Italian bonds from Borsa Italiana using nominal value", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      createAsset({
        id: "bond-1",
        ticker: "BTP",
        type: "bond",
        assetClass: "bonds",
        metadata: {
          isin: "IT0005672024",
          bondDetails: { nominalValue: 1000 },
        },
      }),
    ]);

    const result = await updateLocalUserAssetPrices("user-1");

    expect(getBondPriceByIsinMock).toHaveBeenCalledWith("IT0005672024");
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "bond-1",
          userId: "user-1",
        },
      },
      data: {
        currentPrice: 1042,
      },
    });
    expect(result).toEqual({
      updated: 1,
      failed: [],
      message: "Updated 1 assets, 0 failed",
    });
  });

  it("falls back to Yahoo Finance when the bond scraper has no price", async () => {
    getBondPriceByIsinMock.mockResolvedValue({
      isin: "IT0005672024",
      price: null,
      currency: "EUR",
      priceType: "ultimo",
    });
    prismaMock.asset.findMany.mockResolvedValue([
      createAsset({
        id: "bond-1",
        ticker: "BTP",
        type: "bond",
        assetClass: "bonds",
        metadata: {
          isin: "IT0005672024",
          bondDetails: { nominalValue: 1000 },
        },
      }),
    ]);

    const result = await updateLocalUserAssetPrices("user-1");

    expect(getQuoteMock).toHaveBeenCalledWith("BTP");
    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "bond-1",
          userId: "user-1",
        },
      },
      data: {
        currentPrice: 1010,
      },
    });
    expect(result.updated).toBe(1);
  });

  it("reports failed tickers when quotes are missing", async () => {
    getMultipleQuotesMock.mockResolvedValue(
      new Map([["AAPL", { ticker: "AAPL", price: null, currency: "USD" }]])
    );
    prismaMock.asset.findMany.mockResolvedValue([
      createAsset({ id: "asset-1", ticker: "AAPL", currency: "USD" }),
    ]);

    const result = await updateLocalUserAssetPrices("user-1");

    expect(prismaMock.asset.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      updated: 0,
      failed: ["AAPL"],
      message: "Updated 0 assets, 1 failed",
    });
  });
});

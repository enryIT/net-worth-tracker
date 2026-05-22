import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  prismaMock,
  scrapeLocalAssetDividendsMock,
  syncLocalDividendExpensesMock,
} = vi.hoisted(() => ({
  prismaMock: {
    asset: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    dividend: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    expenseCategory: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    userSetting: {
      findUnique: vi.fn(),
    },
  },
  scrapeLocalAssetDividendsMock: vi.fn(),
  syncLocalDividendExpensesMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/server/dividends/localDividendScrapeService", () => ({
  scrapeLocalAssetDividends: scrapeLocalAssetDividendsMock,
}));

vi.mock("@/lib/server/dividends/localDividendExpenseSyncService", () => ({
  syncLocalDividendExpenses: syncLocalDividendExpensesMock,
}));

import { runLocalDailyDividendProcessing } from "@/lib/server/dividends/localDailyDividendProcessor";

const today = new Date("2026-05-17T00:00:00.000Z");

describe("local daily dividend processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([{ id: "user-1" }]);
    prismaMock.asset.findMany.mockResolvedValue([]);
    prismaMock.userSetting.findUnique.mockResolvedValue(null);
    prismaMock.expenseCategory.findUnique.mockResolvedValue(null);
    prismaMock.dividend.findMany.mockResolvedValue([]);
    prismaMock.dividend.findFirst.mockResolvedValue(null);
    prismaMock.dividend.create.mockResolvedValue({ id: "next-coupon" });
    scrapeLocalAssetDividendsMock.mockResolvedValue({
      success: true,
      scraped: 1,
      filtered: 0,
      created: 1,
      skipped: 0,
      createdIds: ["dividend-1"],
    });
    syncLocalDividendExpensesMock.mockResolvedValue({
      created: 2,
      skipped: 1,
      failed: 0,
    });
  });

  it("scrapes only user equity assets with ISIN metadata", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      { id: "asset-1", metadata: { isin: "IT0003132476" } },
      { id: "asset-2", metadata: {} },
      { id: "asset-3", metadata: { isin: "BTC" } },
    ]);

    const result = await runLocalDailyDividendProcessing({ today });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ select: { id: true } });
    expect(prismaMock.asset.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", assetClass: "equity" },
      select: { id: true, metadata: true },
    });
    expect(scrapeLocalAssetDividendsMock).toHaveBeenCalledTimes(2);
    expect(scrapeLocalAssetDividendsMock).toHaveBeenCalledWith("user-1", "asset-1", { today });
    expect(scrapeLocalAssetDividendsMock).toHaveBeenCalledWith("user-1", "asset-3", { today });
    expect(result.scraping).toEqual({
      assetsScraped: 2,
      newDividends: 2,
      errors: 0,
    });
  });

  it("syncs dividend expenses when dividend income settings are configured", async () => {
    prismaMock.userSetting.findUnique.mockResolvedValue({
      data: {
        dividendIncomeCategoryId: "category-1",
        dividendIncomeSubCategoryId: "subcategory-1",
      },
    });
    prismaMock.expenseCategory.findUnique.mockResolvedValue({
      id: "category-1",
      name: "Dividendi",
      subCategories: [{ id: "subcategory-1", name: "Azioni" }],
    });

    const result = await runLocalDailyDividendProcessing({ today });

    expect(syncLocalDividendExpensesMock).toHaveBeenCalledWith("user-1", {
      categoryId: "category-1",
      categoryName: "Dividendi",
      subCategoryId: "subcategory-1",
      subCategoryName: "Azioni",
      today,
    });
    expect(result.expenseCreation).toEqual({
      processedCount: 2,
      errorCount: 0,
      processedDividends: [],
      errors: [],
    });
  });

  it("schedules the next coupon for paid auto-generated bond coupons", async () => {
    prismaMock.dividend.findMany.mockResolvedValue([
      {
        id: "coupon-1",
        userId: "user-1",
        assetId: "bond-1",
        assetTicker: "BTP",
        assetName: "BTP Valore",
        paymentDate: new Date("2026-05-17T00:00:00.000Z"),
        currency: "EUR",
      },
    ]);
    prismaMock.asset.findUnique.mockResolvedValue({
      id: "bond-1",
      userId: "user-1",
      ticker: "BTP",
      name: "BTP Valore",
      quantity: 10,
      metadata: {
        isin: "IT0000000001",
        averageCost: 99,
        taxRate: 12.5,
        bondDetails: {
          issueDate: "2025-05-17T00:00:00.000Z",
          maturityDate: "2027-05-17T00:00:00.000Z",
          couponRate: 4,
          couponFrequency: "annual",
          nominalValue: 1000,
        },
      },
    });

    const result = await runLocalDailyDividendProcessing({ today });

    expect(prismaMock.dividend.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        dividendType: "coupon",
        isAutoGenerated: true,
        paymentDate: {
          gte: new Date("2026-05-17T00:00:00.000Z"),
          lte: new Date("2026-05-17T23:59:59.999Z"),
        },
      },
    });
    expect(prismaMock.dividend.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        assetId: "bond-1",
        assetTicker: "BTP",
        assetName: "BTP Valore",
        assetIsin: "IT0000000001",
        exDate: new Date("2027-05-17T00:00:00.000Z"),
        paymentDate: new Date("2027-05-17T00:00:00.000Z"),
        dividendPerShare: 40,
        quantity: 10,
        grossAmount: 400,
        taxAmount: 50,
        netAmount: 350,
        currency: "EUR",
        dividendType: "coupon",
        isAutoGenerated: true,
        costPerShare: 99,
      }),
    });
    expect(result.couponScheduling).toEqual({
      scheduled: 1,
      skipped: 0,
      errors: 0,
    });
  });
});

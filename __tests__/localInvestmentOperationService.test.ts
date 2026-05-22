import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock, transactionClient } = vi.hoisted(() => {
  const transactionClient = {
    asset: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    investmentOperation: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    transactionClient,
    prismaMock: {
      investmentOperation: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient)
      ),
    },
  };
});

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createLocalInvestmentOperation,
  deleteLocalInvestmentOperation,
  getLocalRealizedInvestmentSummary,
  listLocalInvestmentOperations,
  updateLocalInvestmentOperation,
} from "@/lib/server/cashflow/localInvestmentOperationService";

const investmentAsset = {
  id: "asset-1",
  userId: "user-1",
  ticker: "VWCE",
  name: "Vanguard FTSE All-World",
  assetClass: "equity",
  currency: "EUR",
  quantity: 10,
  currentPrice: 100,
  metadata: { averageCost: 80 },
};

const cashAsset = {
  id: "cash-1",
  userId: "user-1",
  ticker: "EUR",
  name: "Conto liquidita",
  assetClass: "cash",
  currency: "EUR",
  quantity: 5000,
  currentPrice: 1,
  metadata: {},
};

const operationRow = {
  id: "operation-1",
  userId: "user-1",
  assetId: "asset-1",
  assetName: "Vanguard FTSE All-World",
  assetTicker: "VWCE",
  type: "buy",
  date: new Date("2026-05-17T00:00:00.000Z"),
  quantity: 2,
  pricePerUnit: 100,
  grossAmount: 200,
  fees: 1,
  taxes: 0,
  currency: "EUR",
  cashAssetId: "cash-1",
  cashAssetName: "Conto liquidita",
  linkedExpenseId: null,
  notes: null,
  previousQuantity: 10,
  previousAverageCost: 80,
  resultingQuantity: 12,
  resultingAverageCost: 83.41666666666667,
  realizedGain: null,
  realizedGainTax: null,
  netCashEffect: -201,
  legacyFirebaseId: null,
  createdAt: new Date("2026-05-17T10:00:00.000Z"),
  updatedAt: new Date("2026-05-17T10:00:00.000Z"),
};

describe("local investment operation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists operations scoped to a user ordered by date descending", async () => {
    prismaMock.investmentOperation.findMany.mockResolvedValue([operationRow]);

    const operations = await listLocalInvestmentOperations("user-1");

    expect(prismaMock.investmentOperation.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(operations[0]).toMatchObject({
      id: "operation-1",
      assetName: "Vanguard FTSE All-World",
      quantity: 2,
      netCashEffect: -201,
    });
  });

  it("creates buy operations and updates asset plus cash balance in one transaction", async () => {
    transactionClient.asset.findUnique
      .mockResolvedValueOnce(investmentAsset)
      .mockResolvedValueOnce(cashAsset);
    transactionClient.investmentOperation.create.mockResolvedValue(operationRow);

    await createLocalInvestmentOperation("user-1", {
      assetId: "asset-1",
      type: "buy",
      quantity: 2,
      pricePerUnit: 100,
      fees: 1,
      date: new Date("2026-05-17T00:00:00.000Z"),
      cashAssetId: "cash-1",
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "asset-1", userId: "user-1" } },
      data: {
        quantity: 12,
        metadata: expect.objectContaining({
          averageCost: 83.41666666666667,
        }),
      },
    });
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-1", userId: "user-1" } },
      data: { quantity: { increment: -201 } },
    });
    expect(transactionClient.investmentOperation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        assetId: "asset-1",
        assetName: "Vanguard FTSE All-World",
        assetTicker: "VWCE",
        type: "buy",
        grossAmount: 200,
        previousQuantity: 10,
        previousAverageCost: 80,
        resultingQuantity: 12,
        netCashEffect: -201,
      }),
    });
  });

  it("rejects cash assets as investment operation targets", async () => {
    transactionClient.asset.findUnique.mockResolvedValue(cashAsset);

    await expect(
      createLocalInvestmentOperation("user-1", {
        assetId: "cash-1",
        type: "buy",
        quantity: 1,
        pricePerUnit: 1,
        date: new Date("2026-05-17T00:00:00.000Z"),
      })
    ).rejects.toThrow("Use internal transfers or cashflow entries for cash assets");
  });

  it("builds realized investment summary from sell operations", async () => {
    prismaMock.investmentOperation.findMany.mockResolvedValue([
      {
        ...operationRow,
        id: "sell-1",
        type: "sell",
        realizedGain: 50,
        realizedGainTax: 13,
      },
    ]);

    await expect(getLocalRealizedInvestmentSummary("user-1")).resolves.toEqual({
      totalRealizedGain: 50,
      totalRealizedTaxes: 13,
      totalNetRealizedGain: 37,
      sellsCount: 1,
      byAsset: [
        {
          assetId: "asset-1",
          assetName: "Vanguard FTSE All-World",
          assetTicker: "VWCE",
          realizedGain: 50,
          realizedTaxes: 13,
          netRealizedGain: 37,
          sellsCount: 1,
        },
      ],
    });
  });

  it("updates operations by reversing the old cash effect and applying the new one", async () => {
    transactionClient.investmentOperation.findUnique.mockResolvedValue(operationRow);
    transactionClient.asset.findUnique
      .mockResolvedValueOnce({
        ...investmentAsset,
        quantity: 12,
        metadata: { averageCost: 83.41666666666667 },
      })
      .mockResolvedValueOnce(cashAsset);
    transactionClient.investmentOperation.update.mockResolvedValue({
      ...operationRow,
      quantity: 1,
      grossAmount: 110,
      fees: 2,
      resultingQuantity: 11,
      resultingAverageCost: 82.9090909090909,
      netCashEffect: -112,
    });

    await updateLocalInvestmentOperation("user-1", "operation-1", {
      assetId: "asset-1",
      type: "buy",
      quantity: 1,
      pricePerUnit: 110,
      fees: 2,
      date: new Date("2026-05-18T00:00:00.000Z"),
      cashAssetId: "cash-1",
    });

    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "asset-1", userId: "user-1" } },
      data: {
        quantity: 11,
        metadata: expect.objectContaining({
          averageCost: 82.9090909090909,
        }),
      },
    });
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-1", userId: "user-1" } },
      data: { quantity: { increment: 89 } },
    });
    expect(transactionClient.investmentOperation.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "operation-1", userId: "user-1" } },
      data: expect.objectContaining({
        quantity: 1,
        grossAmount: 110,
        netCashEffect: -112,
      }),
    });
  });

  it("refuses to update when the asset changed after the operation", async () => {
    transactionClient.investmentOperation.findUnique.mockResolvedValue(operationRow);
    transactionClient.asset.findUnique.mockResolvedValue({
      ...investmentAsset,
      quantity: 13,
    });

    await expect(
      updateLocalInvestmentOperation("user-1", "operation-1", {
        assetId: "asset-1",
        type: "buy",
        quantity: 1,
        pricePerUnit: 110,
        date: new Date("2026-05-18T00:00:00.000Z"),
      })
    ).rejects.toThrow("Cannot update operation because the asset changed after it was recorded");
    expect(transactionClient.investmentOperation.update).not.toHaveBeenCalled();
  });

  it("deletes operations by restoring investment and cash balances", async () => {
    transactionClient.investmentOperation.findUnique.mockResolvedValue(operationRow);
    transactionClient.asset.findUnique
      .mockResolvedValueOnce({
        ...investmentAsset,
        quantity: 12,
        metadata: { averageCost: 83.41666666666667 },
      })
      .mockResolvedValueOnce(cashAsset);
    transactionClient.investmentOperation.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      deleteLocalInvestmentOperation("user-1", "operation-1")
    ).resolves.toBe(true);

    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "asset-1", userId: "user-1" } },
      data: {
        quantity: 10,
        metadata: expect.objectContaining({
          averageCost: 80,
        }),
      },
    });
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-1", userId: "user-1" } },
      data: { quantity: { increment: 201 } },
    });
    expect(transactionClient.investmentOperation.deleteMany).toHaveBeenCalledWith({
      where: { id: "operation-1", userId: "user-1" },
    });
  });
});

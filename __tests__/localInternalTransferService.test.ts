import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock, transactionClient } = vi.hoisted(() => {
  const transactionClient = {
    asset: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    internalTransfer: {
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
      internalTransfer: {
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
  createLocalInternalTransfer,
  deleteLocalInternalTransfer,
  listLocalInternalTransfers,
  updateLocalInternalTransfer,
} from "@/lib/server/cashflow/localInternalTransferService";

const fromAsset = {
  id: "cash-1",
  userId: "user-1",
  name: "Conto A",
  assetClass: "cash",
  currency: "EUR",
  quantity: 1000,
};

const toAsset = {
  id: "cash-2",
  userId: "user-1",
  name: "Conto B",
  assetClass: "cash",
  currency: "EUR",
  quantity: 100,
};

const transferRow = {
  id: "transfer-1",
  userId: "user-1",
  fromCashAssetId: "cash-1",
  fromCashAssetName: "Conto A",
  toCashAssetId: "cash-2",
  toCashAssetName: "Conto B",
  amount: 250,
  currency: "EUR",
  date: new Date("2026-05-17T00:00:00.000Z"),
  fees: 2,
  purpose: "neutral_transfer",
  notes: null,
  linkedExpenseId: null,
  legacyFirebaseId: null,
  createdAt: new Date("2026-05-17T10:00:00.000Z"),
  updatedAt: new Date("2026-05-17T10:00:00.000Z"),
};

describe("local internal transfer service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists transfers scoped to a user ordered by date descending", async () => {
    prismaMock.internalTransfer.findMany.mockResolvedValue([transferRow]);

    const transfers = await listLocalInternalTransfers("user-1");

    expect(prismaMock.internalTransfer.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    expect(transfers[0]).toMatchObject({
      id: "transfer-1",
      fromCashAssetName: "Conto A",
      toCashAssetName: "Conto B",
      amount: 250,
    });
  });

  it("creates transfers and updates both cash asset balances in one transaction", async () => {
    transactionClient.asset.findMany.mockResolvedValue([fromAsset, toAsset]);
    transactionClient.internalTransfer.create.mockResolvedValue(transferRow);

    await createLocalInternalTransfer("user-1", {
      fromCashAssetId: "cash-1",
      toCashAssetId: "cash-2",
      amount: 250,
      fees: 2,
      date: new Date("2026-05-17T00:00:00.000Z"),
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-1", userId: "user-1" } },
      data: { quantity: { decrement: 252 } },
    });
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-2", userId: "user-1" } },
      data: { quantity: { increment: 250 } },
    });
    expect(transactionClient.internalTransfer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        fromCashAssetId: "cash-1",
        fromCashAssetName: "Conto A",
        toCashAssetId: "cash-2",
        toCashAssetName: "Conto B",
        amount: 250,
        fees: 2,
        purpose: "neutral_transfer",
      }),
    });
  });

  it("rejects transfers between the same cash asset", async () => {
    await expect(
      createLocalInternalTransfer("user-1", {
        fromCashAssetId: "cash-1",
        toCashAssetId: "cash-1",
        amount: 250,
        date: new Date("2026-05-17T00:00:00.000Z"),
      })
    ).rejects.toThrow("Source and destination cash assets must be different");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("updates a transfer by reversing old deltas and applying new deltas", async () => {
    transactionClient.internalTransfer.findUnique.mockResolvedValue(transferRow);
    transactionClient.asset.findMany.mockResolvedValue([fromAsset, toAsset]);
    transactionClient.internalTransfer.update.mockResolvedValue({
      ...transferRow,
      amount: 100,
      fees: 1,
    });

    await updateLocalInternalTransfer("user-1", "transfer-1", {
      fromCashAssetId: "cash-1",
      toCashAssetId: "cash-2",
      amount: 100,
      fees: 1,
      date: new Date("2026-05-18T00:00:00.000Z"),
    });

    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-1", userId: "user-1" } },
      data: { quantity: { increment: 151 } },
    });
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-2", userId: "user-1" } },
      data: { quantity: { decrement: 150 } },
    });
    expect(transactionClient.internalTransfer.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "transfer-1", userId: "user-1" } },
      data: expect.objectContaining({
        amount: 100,
        fees: 1,
      }),
    });
  });

  it("deletes a transfer and restores cash asset balances", async () => {
    transactionClient.internalTransfer.findUnique.mockResolvedValue(transferRow);
    transactionClient.asset.findMany.mockResolvedValue([fromAsset, toAsset]);
    transactionClient.internalTransfer.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      deleteLocalInternalTransfer("user-1", "transfer-1")
    ).resolves.toBe(true);

    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-1", userId: "user-1" } },
      data: { quantity: { increment: 252 } },
    });
    expect(transactionClient.asset.update).toHaveBeenCalledWith({
      where: { id_userId: { id: "cash-2", userId: "user-1" } },
      data: { quantity: { decrement: 250 } },
    });
    expect(transactionClient.internalTransfer.deleteMany).toHaveBeenCalledWith({
      where: { id: "transfer-1", userId: "user-1" },
    });
  });
});

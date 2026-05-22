import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    asset: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createLocalAsset,
  deleteLocalAsset,
  listLocalAssets,
  updateLocalAsset,
} from "@/lib/server/assets/localAssetService";

describe("local asset service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists assets scoped to a user ordered by class and name", async () => {
    prismaMock.asset.findMany.mockResolvedValue([
      {
        id: "asset-1",
        userId: "user-1",
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        type: "etf",
        assetClass: "equity",
        subCategory: null,
        currency: "EUR",
        quantity: 10,
        currentPrice: 100,
        currentPriceEur: null,
        metadata: {},
        createdAt: new Date("2026-05-16T10:00:00.000Z"),
        updatedAt: new Date("2026-05-16T10:00:00.000Z"),
      },
    ]);

    const assets = await listLocalAssets("user-1");

    expect(prismaMock.asset.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ assetClass: "asc" }, { name: "asc" }],
    });
    expect(assets[0]).toMatchObject({
      id: "asset-1",
      userId: "user-1",
      ticker: "VWCE",
      name: "Vanguard FTSE All-World",
      assetClass: "equity",
      quantity: 10,
    });
    expect(assets[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("creates a user-scoped asset", async () => {
    prismaMock.asset.create.mockResolvedValue({
      id: "asset-1",
      userId: "user-1",
      ticker: "XEON",
      name: "Xtrackers Overnight",
      type: "etf",
      assetClass: "cash",
      subCategory: "Money Market",
      currency: "EUR",
      quantity: 5,
      currentPrice: 140,
      currentPriceEur: null,
      metadata: { autoUpdatePrice: true },
      createdAt: new Date("2026-05-16T10:00:00.000Z"),
      updatedAt: new Date("2026-05-16T10:00:00.000Z"),
    });

    await createLocalAsset("user-1", {
      ticker: "XEON",
      name: "Xtrackers Overnight",
      type: "etf",
      assetClass: "cash",
      subCategory: "Money Market",
      currency: "EUR",
      quantity: 5,
      currentPrice: 140,
      autoUpdatePrice: true,
    });

    expect(prismaMock.asset.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        ticker: "XEON",
        name: "Xtrackers Overnight",
        type: "etf",
        assetClass: "cash",
        subCategory: "Money Market",
        currency: "EUR",
        quantity: 5,
        currentPrice: 140,
        currentPriceEur: undefined,
        metadata: {
          autoUpdatePrice: true,
        },
      },
    });
  });

  it("updates a user-scoped asset", async () => {
    prismaMock.asset.update.mockResolvedValue({
      id: "asset-1",
      userId: "user-1",
      ticker: "XEON",
      name: "Xtrackers Overnight",
      type: "etf",
      assetClass: "cash",
      subCategory: "Money Market",
      currency: "EUR",
      quantity: 7,
      currentPrice: 141,
      currentPriceEur: null,
      metadata: { averageCost: 139 },
      createdAt: new Date("2026-05-16T10:00:00.000Z"),
      updatedAt: new Date("2026-05-16T11:00:00.000Z"),
    });

    const updatedAsset = await updateLocalAsset("user-1", "asset-1", {
      ticker: "XEON",
      name: "Xtrackers Overnight",
      type: "etf",
      assetClass: "cash",
      subCategory: "Money Market",
      currency: "EUR",
      quantity: 7,
      currentPrice: 141,
      averageCost: 139,
    });

    expect(prismaMock.asset.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "asset-1",
          userId: "user-1",
        },
      },
      data: {
        ticker: "XEON",
        name: "Xtrackers Overnight",
        type: "etf",
        assetClass: "cash",
        subCategory: "Money Market",
        currency: "EUR",
        quantity: 7,
        currentPrice: 141,
        currentPriceEur: undefined,
        metadata: {
          averageCost: 139,
        },
      },
    });
    expect(updatedAsset).not.toBeNull();
    expect(updatedAsset?.quantity).toBe(7);
  });

  it("deletes only assets owned by the user", async () => {
    prismaMock.asset.deleteMany.mockResolvedValue({ count: 1 });

    const deleted = await deleteLocalAsset("user-1", "asset-1");

    expect(prismaMock.asset.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "asset-1",
        userId: "user-1",
      },
    });
    expect(deleted).toBe(true);
  });
});

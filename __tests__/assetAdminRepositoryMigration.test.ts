import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { listLocalAssetsMock } = vi.hoisted(() => ({
  listLocalAssetsMock: vi.fn(),
}));

vi.mock("@/lib/server/assets/localAssetService", () => ({
  listLocalAssets: listLocalAssetsMock,
}));

import { getUserAssetsAdmin } from "@/lib/server/assetAdminRepository";

describe("asset admin repository migration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("delegates the legacy server asset helper to the local Prisma-backed service", async () => {
    const assets = [
      {
        id: "asset-1",
        userId: "user-1",
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        type: "etf",
        assetClass: "equity",
        currency: "EUR",
        quantity: 3,
        currentPrice: 100,
        createdAt: new Date("2026-05-25T10:00:00.000Z"),
        updatedAt: new Date("2026-05-25T10:00:00.000Z"),
      },
    ];
    listLocalAssetsMock.mockResolvedValue(assets);

    await expect(getUserAssetsAdmin("user-1")).resolves.toBe(assets);

    expect(listLocalAssetsMock).toHaveBeenCalledWith("user-1");
    expect(listLocalAssetsMock).toHaveBeenCalledTimes(1);
  });

  it("does not import Firebase Admin runtime from the compatibility helper", () => {
    const source = readFileSync("lib/server/assetAdminRepository.ts", "utf8");

    expect(source).not.toMatch(/from ['"]@\/lib\/firebase\/admin['"]|adminDb|firebase-admin\/firestore|Firebase Admin SDK/);
  });
});

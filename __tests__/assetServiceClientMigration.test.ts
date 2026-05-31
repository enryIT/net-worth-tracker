import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const {
  addDocMock,
  appendHouseholdAuditEntrySafeMock,
  authenticatedFetchMock,
  collectionMock,
  deleteDocMock,
  deleteFieldMock,
  docMock,
  getDocMock,
  getDocsMock,
  invalidateDashboardOverviewSummaryMock,
  limitMock,
  orderByMock,
  queryMock,
  setDocMock,
  updateDocMock,
  whereMock,
} = vi.hoisted(() => ({
  addDocMock: vi.fn(),
  appendHouseholdAuditEntrySafeMock: vi.fn(),
  authenticatedFetchMock: vi.fn(),
  collectionMock: vi.fn(),
  deleteDocMock: vi.fn(),
  deleteFieldMock: vi.fn(),
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  getDocsMock: vi.fn(),
  invalidateDashboardOverviewSummaryMock: vi.fn(),
  limitMock: vi.fn(),
  orderByMock: vi.fn(),
  queryMock: vi.fn(),
  setDocMock: vi.fn(),
  updateDocMock: vi.fn(),
  whereMock: vi.fn(),
}));

vi.mock("@/lib/utils/authFetch", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

vi.mock("@/lib/services/dashboardOverviewInvalidation", () => ({
  invalidateDashboardOverviewSummary: invalidateDashboardOverviewSummaryMock,
}));

vi.mock("@/lib/services/householdService", () => ({
  appendHouseholdAuditEntrySafe: appendHouseholdAuditEntrySafeMock,
}));

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  addDoc: addDocMock,
  collection: collectionMock,
  deleteDoc: deleteDocMock,
  deleteField: deleteFieldMock,
  doc: docMock,
  getDoc: getDocMock,
  getDocs: getDocsMock,
  limit: limitMock,
  orderBy: orderByMock,
  query: queryMock,
  setDoc: setDocMock,
  Timestamp: {
    now: () => ({ toDate: () => new Date("2026-05-31T10:00:00.000Z") }),
  },
  updateDoc: updateDocMock,
  where: whereMock,
}));

import {
  createAsset,
  deleteAsset,
  getAllAssets,
  getAssetById,
  getAssetsWithIsin,
  updateAsset,
  updateAssetPrice,
  updateCashAssetBalance,
  updateInvestmentAssetQuantity,
} from "@/lib/services/assetService";
import type { AssetFormData } from "@/types/assets";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

const baseAssetPayload = {
  id: "asset-1",
  userId: "session-user",
  ticker: "VWCE",
  name: "Vanguard FTSE All-World",
  type: "etf",
  assetClass: "equity",
  currency: "EUR",
  quantity: 10,
  currentPrice: 120,
  averageCost: 110,
  createdAt: "2026-05-30T10:00:00.000Z",
  updatedAt: "2026-05-30T10:00:00.000Z",
  lastPriceUpdate: "2026-05-30T10:00:00.000Z",
};

const assetFormData: AssetFormData = {
  ticker: "VWCE",
  name: "Vanguard FTSE All-World",
  type: "etf",
  assetClass: "equity",
  currency: "EUR",
  quantity: 10,
  currentPrice: 120,
  averageCost: 110,
  isin: "IE00BK5BQT80",
};

function expectNoFirestoreCalls(): void {
  expect(collectionMock).not.toHaveBeenCalled();
  expect(docMock).not.toHaveBeenCalled();
  expect(getDocMock).not.toHaveBeenCalled();
  expect(getDocsMock).not.toHaveBeenCalled();
  expect(addDocMock).not.toHaveBeenCalled();
  expect(setDocMock).not.toHaveBeenCalled();
  expect(updateDocMock).not.toHaveBeenCalled();
  expect(deleteDocMock).not.toHaveBeenCalled();
  expect(queryMock).not.toHaveBeenCalled();
  expect(whereMock).not.toHaveBeenCalled();
  expect(limitMock).not.toHaveBeenCalled();
  expect(orderByMock).not.toHaveBeenCalled();
  expect(deleteFieldMock).not.toHaveBeenCalled();
}

describe("assetService Firebase-to-local API migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the client wrapper free from firebase runtime imports", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/services/assetService.ts"), "utf8");

    expect(source).not.toMatch(/firebase\/firestore|@\/lib\/firebase\/config/);
  });

  it("loads assets through /api/assets", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse([baseAssetPayload]));

    const assets = await getAllAssets("legacy-user-id");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/assets", { method: "GET" });
    expect(assets[0]?.id).toBe("asset-1");
    expect(assets[0]?.createdAt).toBeInstanceOf(Date);
    expectNoFirestoreCalls();
  });

  it("loads assets with isin from /api/assets", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      jsonResponse([
        { ...baseAssetPayload, isin: "IE00BK5BQT80" },
        { ...baseAssetPayload, id: "asset-2", name: "No isin", isin: "" },
        { ...baseAssetPayload, id: "asset-3", assetClass: "cash", isin: "IGNORED" },
      ])
    );

    const assets = await getAssetsWithIsin("legacy-user-id");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/assets", { method: "GET" });
    expect(assets).toHaveLength(1);
    expect(assets[0]?.isin).toBe("IE00BK5BQT80");
    expectNoFirestoreCalls();
  });

  it("loads one asset through /api/assets/[assetId]", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(baseAssetPayload));

    const asset = await getAssetById("asset-1");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/assets/asset-1", {
      method: "GET",
    });
    expect(asset?.id).toBe("asset-1");
    expectNoFirestoreCalls();
  });

  it("creates assets through /api/assets", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(baseAssetPayload, { status: 201 }));

    const createdId = await createAsset("legacy-user-id", assetFormData);

    expect(createdId).toBe("asset-1");
    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assetFormData),
    });
    expect(invalidateDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "legacy-user-id",
      "asset_created"
    );
    expect(appendHouseholdAuditEntrySafeMock).toHaveBeenCalled();
    expectNoFirestoreCalls();
  });

  it("updates assets through /api/assets/[assetId]", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(baseAssetPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseAssetPayload,
          name: "VWCE aggiornato",
        })
      );

    await updateAsset("asset-1", { name: "VWCE aggiornato" });

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/assets/asset-1", {
      method: "GET",
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(2, "/api/assets/asset-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: "VWCE",
        name: "VWCE aggiornato",
        type: "etf",
        assetClass: "equity",
        subCategory: undefined,
        currency: "EUR",
        quantity: 10,
        averageCost: 110,
        taxRate: undefined,
        totalExpenseRatio: undefined,
        stampDutyExempt: undefined,
        includeInHistoryTables: undefined,
        currentPrice: 120,
        currentPriceEur: undefined,
        isLiquid: undefined,
        autoUpdatePrice: undefined,
        composition: undefined,
        outstandingDebt: undefined,
        isPrimaryResidence: undefined,
        isin: undefined,
        bondDetails: undefined,
        pensionFundDetails: undefined,
        ownershipProfileId: undefined,
        ownershipProfileName: undefined,
        ownershipSplits: undefined,
      }),
    });
    expectNoFirestoreCalls();
  });

  it("updates asset prices through /api/assets/[assetId]", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(baseAssetPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseAssetPayload,
          currentPrice: 133,
        })
      );

    await updateAssetPrice("asset-1", 133);

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/assets/asset-1", {
      method: "GET",
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(2, "/api/assets/asset-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expectNoFirestoreCalls();
  });

  it("updates cash asset balances through /api/assets/[assetId]", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseAssetPayload,
          assetClass: "cash",
          quantity: 100,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseAssetPayload,
          assetClass: "cash",
          quantity: 150,
        })
      );

    await updateCashAssetBalance("asset-1", 50);

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/assets/asset-1", {
      method: "GET",
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(2, "/api/assets/asset-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expectNoFirestoreCalls();
  });

  it("updates investment quantities through /api/assets/[assetId]", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(baseAssetPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          ...baseAssetPayload,
          quantity: 11,
        })
      );

    await updateInvestmentAssetQuantity("asset-1", 1);

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/assets/asset-1", {
      method: "GET",
    });
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(2, "/api/assets/asset-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
    expectNoFirestoreCalls();
  });

  it("deletes assets through /api/assets/[assetId]", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await deleteAsset("asset-1", "legacy-user-id");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/assets/asset-1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "legacy-user-id" }),
    });
    expectNoFirestoreCalls();
  });
});

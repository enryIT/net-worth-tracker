import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Asset, MonthlySnapshot } from "@/types/assets";

const {
  authenticatedFetchMock,
  buildOwnershipSnapshotBreakdownMock,
  calculateCurrentAllocationMock,
  calculateFIRENetWorthMock,
  calculateIlliquidNetWorthMock,
  calculateLiquidNetWorthMock,
  calculateTotalValueMock,
  collectionMock,
  deleteFieldMock,
  docMock,
  getDocsMock,
  getHouseholdConfigMock,
  getItalyMonthYearMock,
  orderByMock,
  queryMock,
  setDocMock,
  whereMock,
} = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  buildOwnershipSnapshotBreakdownMock: vi.fn(),
  calculateCurrentAllocationMock: vi.fn(),
  calculateFIRENetWorthMock: vi.fn(),
  calculateIlliquidNetWorthMock: vi.fn(),
  calculateLiquidNetWorthMock: vi.fn(),
  calculateTotalValueMock: vi.fn(),
  collectionMock: vi.fn(),
  deleteFieldMock: vi.fn(() => "__delete_field__"),
  docMock: vi.fn(),
  getDocsMock: vi.fn(),
  getHouseholdConfigMock: vi.fn(),
  getItalyMonthYearMock: vi.fn(),
  orderByMock: vi.fn(),
  queryMock: vi.fn(),
  setDocMock: vi.fn(),
  whereMock: vi.fn(),
}));

vi.mock("@/lib/utils/authFetch", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

vi.mock("@/lib/services/assetService", () => ({
  calculateAssetValue: vi.fn((asset: { quantity: number; currentPrice: number }) => (
    asset.quantity * asset.currentPrice
  )),
  calculateTotalValue: calculateTotalValueMock,
  calculateLiquidNetWorth: calculateLiquidNetWorthMock,
  calculateIlliquidNetWorth: calculateIlliquidNetWorthMock,
  calculateFIRENetWorth: calculateFIRENetWorthMock,
}));

vi.mock("@/lib/services/assetAllocationService", () => ({
  calculateCurrentAllocation: calculateCurrentAllocationMock,
}));

vi.mock("@/lib/services/householdService", () => ({
  getHouseholdConfig: getHouseholdConfigMock,
}));

vi.mock("@/lib/utils/dateHelpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/dateHelpers")>(
    "@/lib/utils/dateHelpers"
  );

  return {
    ...actual,
    getItalyMonthYear: getItalyMonthYearMock,
  };
});

vi.mock("@/lib/utils/householdUtils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/householdUtils")>(
    "@/lib/utils/householdUtils"
  );

  return {
    ...actual,
    buildOwnershipSnapshotBreakdown: buildOwnershipSnapshotBreakdownMock,
  };
});

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  deleteField: deleteFieldMock,
  doc: docMock,
  getDocs: getDocsMock,
  orderBy: orderByMock,
  query: queryMock,
  setDoc: setDocMock,
  where: whereMock,
  Timestamp: {
    now: () => ({ toDate: () => new Date("2026-06-01T10:00:00.000Z") }),
  },
}));

import {
  createSnapshot,
  getUserSnapshots,
  updateSnapshotNote,
} from "@/lib/services/snapshotService";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset-1",
    userId: "legacy-user-id",
    ticker: "AAPL",
    name: "Apple",
    type: "stock",
    assetClass: "equity",
    currency: "EUR",
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date("2026-06-01T10:00:00.000Z"),
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-01T10:00:00.000Z"),
    ...overrides,
  };
}

function baseSnapshot(overrides: Partial<MonthlySnapshot> = {}): MonthlySnapshot {
  return {
    userId: "legacy-user-id",
    year: 2026,
    month: 5,
    totalNetWorth: 200,
    liquidNetWorth: 150,
    illiquidNetWorth: 50,
    fireNetWorth: 120,
    byAssetClass: { equity: 120, bonds: 80 },
    byAsset: [
      {
        assetId: "asset-1",
        ticker: "AAPL",
        name: "Apple",
        quantity: 1,
        price: 100,
        totalValue: 100,
      },
    ],
    byOwnershipProfile: {},
    byParticipant: {},
    assetAllocation: { equity: 60, bonds: 40 },
    createdAt: new Date("2026-05-31T10:00:00.000Z"),
    ...overrides,
  };
}

function expectNoFirestoreCalls(): void {
  expect(collectionMock).not.toHaveBeenCalled();
  expect(docMock).not.toHaveBeenCalled();
  expect(getDocsMock).not.toHaveBeenCalled();
  expect(queryMock).not.toHaveBeenCalled();
  expect(whereMock).not.toHaveBeenCalled();
  expect(orderByMock).not.toHaveBeenCalled();
  expect(setDocMock).not.toHaveBeenCalled();
  expect(deleteFieldMock).not.toHaveBeenCalled();
}

describe("snapshotService Firebase-to-local API migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    calculateTotalValueMock.mockReturnValue(200);
    calculateLiquidNetWorthMock.mockReturnValue(150);
    calculateIlliquidNetWorthMock.mockReturnValue(50);
    calculateFIRENetWorthMock.mockReturnValue(120);
    calculateCurrentAllocationMock.mockReturnValue({
      byAssetClass: { equity: 120, bonds: 80 },
      bySubCategory: {},
      totalValue: 200,
    });
    getItalyMonthYearMock.mockReturnValue({ month: 6, year: 2026 });
    getHouseholdConfigMock.mockResolvedValue({
      userId: "legacy-user-id",
      enabled: false,
      participants: [],
      defaultAssetOwnerId: null,
    });
    buildOwnershipSnapshotBreakdownMock.mockReturnValue({
      byAsset: baseSnapshot().byAsset,
      byOwnershipProfile: {},
      byParticipant: {},
    });
  });

  it("keeps the client wrapper free from firebase runtime imports", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/services/snapshotService.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/firebase\/firestore|@\/lib\/firebase\/config/);
  });

  it("creates snapshots through /api/snapshots with computed payload", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(baseSnapshot(), { status: 201 }));

    const snapshotId = await createSnapshot("legacy-user-id", [createAsset()], 2025, 12);

    expect(snapshotId).toBe("legacy-user-id-2025-12");
    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        year: 2025,
        month: 12,
        totalNetWorth: 200,
        liquidNetWorth: 150,
        illiquidNetWorth: 50,
        fireNetWorth: 120,
        byAssetClass: { equity: 120, bonds: 80 },
        byAsset: baseSnapshot().byAsset,
        byOwnershipProfile: {},
        byParticipant: {},
        assetAllocation: { equity: 60, bonds: 40 },
      }),
    });
    expectNoFirestoreCalls();
  });

  it("defaults snapshot period using Italy month/year helper", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(baseSnapshot(), { status: 201 }));

    const snapshotId = await createSnapshot("legacy-user-id", [createAsset()]);

    expect(snapshotId).toBe("legacy-user-id-2026-6");
    const requestBody = JSON.parse(authenticatedFetchMock.mock.calls[0][1].body as string) as {
      year: number;
      month: number;
    };
    expect(requestBody).toMatchObject({ year: 2026, month: 6 });
  });

  it("loads user snapshots from /api/snapshots and normalizes dates", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          ...baseSnapshot(),
          createdAt: "2026-05-31T10:00:00.000Z",
        },
      ])
    );

    const snapshots = await getUserSnapshots("legacy-user-id");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/snapshots", {
      method: "GET",
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].createdAt).toBeInstanceOf(Date);
    expectNoFirestoreCalls();
  });

  it("updates snapshot notes through /api/snapshots", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse([baseSnapshot({ note: "Vecchia nota" })]))
      .mockResolvedValueOnce(jsonResponse(baseSnapshot({ note: "Nuova nota" }), { status: 201 }));

    await updateSnapshotNote("legacy-user-id", 2026, 5, "  Nuova nota ");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(1, "/api/snapshots", {
      method: "GET",
    });

    const secondCall = authenticatedFetchMock.mock.calls[1];
    expect(secondCall[0]).toBe("/api/snapshots");
    expect(secondCall[1]?.method).toBe("POST");
    expect(secondCall[1]?.headers).toEqual({ "Content-Type": "application/json" });

    const payload = JSON.parse(secondCall[1]?.body as string) as MonthlySnapshot;
    expect(payload.year).toBe(2026);
    expect(payload.month).toBe(5);
    expect(payload.note).toBe("Nuova nota");
    expectNoFirestoreCalls();
  });

  it("stores empty note as empty string to preserve note deletion behavior", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse([baseSnapshot({ note: "Da cancellare" })]))
      .mockResolvedValueOnce(jsonResponse(baseSnapshot({ note: "" }), { status: 201 }));

    await updateSnapshotNote("legacy-user-id", 2026, 5, "   ");

    const payload = JSON.parse(authenticatedFetchMock.mock.calls[1][1].body as string) as {
      note: string;
    };
    expect(payload.note).toBe("");
  });

  it("rejects notes longer than 500 characters", async () => {
    await expect(
      updateSnapshotNote("legacy-user-id", 2026, 5, "x".repeat(501))
    ).rejects.toThrow("Note cannot exceed 500 characters");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const {
  collectionMock,
  docMock,
  getDocsMock,
  queryMock,
  whereMock,
  writeBatchMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  docMock: vi.fn(),
  getDocsMock: vi.fn(),
  queryMock: vi.fn(),
  whereMock: vi.fn(),
  writeBatchMock: vi.fn(),
}));

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  doc: docMock,
  getDocs: getDocsMock,
  query: queryMock,
  where: whereMock,
  writeBatch: writeBatchMock,
}));

import {
  deleteAllDummyData,
  deleteDummyCategories,
  deleteDummyExpenses,
  deleteDummySnapshots,
  getDummyDataCount,
} from "@/lib/services/dummyDataService";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function expectNoFirestoreCalls(): void {
  expect(collectionMock).not.toHaveBeenCalled();
  expect(docMock).not.toHaveBeenCalled();
  expect(getDocsMock).not.toHaveBeenCalled();
  expect(queryMock).not.toHaveBeenCalled();
  expect(whereMock).not.toHaveBeenCalled();
  expect(writeBatchMock).not.toHaveBeenCalled();
}

describe("dummyDataService Firebase-to-local API migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the client wrapper free from firebase runtime imports", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/services/dummyDataService.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/firebase\/firestore|@\/lib\/firebase\/config/);
  });

  it("loads dummy counts through /api/dummy-data", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        snapshots: 3,
        expenses: 4,
        categories: 2,
        total: 9,
      })
    );

    await expect(getDummyDataCount("legacy-firebase-user")).resolves.toEqual({
      snapshots: 3,
      expenses: 4,
      categories: 2,
      total: 9,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/dummy-data", {
      method: "GET",
      credentials: "same-origin",
    });
    expectNoFirestoreCalls();
  });

  it("deletes all dummy data through /api/dummy-data", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        snapshots: 2,
        expenses: 5,
        categories: 1,
        total: 8,
      })
    );

    await expect(deleteAllDummyData("legacy-firebase-user")).resolves.toEqual({
      snapshots: 2,
      expenses: 5,
      categories: 1,
      total: 8,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/dummy-data", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expectNoFirestoreCalls();
  });

  it("deletes dummy snapshots through /api/dummy-data?target=snapshots", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        snapshots: 6,
        expenses: 0,
        categories: 0,
        total: 6,
      })
    );

    await expect(deleteDummySnapshots("legacy-firebase-user")).resolves.toBe(6);

    expect(fetchMock).toHaveBeenCalledWith("/api/dummy-data?target=snapshots", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expectNoFirestoreCalls();
  });

  it("deletes dummy expenses through /api/dummy-data?target=expenses", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        snapshots: 0,
        expenses: 7,
        categories: 0,
        total: 7,
      })
    );

    await expect(deleteDummyExpenses("legacy-firebase-user")).resolves.toBe(7);

    expect(fetchMock).toHaveBeenCalledWith("/api/dummy-data?target=expenses", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expectNoFirestoreCalls();
  });

  it("deletes dummy categories through /api/dummy-data?target=categories", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        snapshots: 0,
        expenses: 0,
        categories: 4,
        total: 4,
      })
    );

    await expect(deleteDummyCategories("legacy-firebase-user")).resolves.toBe(4);

    expect(fetchMock).toHaveBeenCalledWith("/api/dummy-data?target=categories", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expectNoFirestoreCalls();
  });

  it("surfaces local API errors", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Non autorizzato" }, { status: 401 })
    );

    await expect(getDummyDataCount("legacy-firebase-user")).rejects.toThrow(
      "Non autorizzato"
    );
  });
});

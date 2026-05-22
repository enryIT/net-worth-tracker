import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

import {
  createCostCenter,
  deleteCostCenter,
  getCostCenters,
  getExpensesForCostCenter,
  updateCostCenter,
} from "@/lib/services/costCenterService";
import { collection } from "firebase/firestore";
import type { CostCenter } from "@/types/costCenters";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("costCenterService client wrapper", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(collection).mockClear();
  });

  it("lists cost centers through the local API without reading Firestore", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "cost-center-1",
          userId: "session-user",
          name: "Automobile",
          createdAt: "2026-05-22T08:00:00.000Z",
          updatedAt: "2026-05-22T08:00:00.000Z",
        },
      ])
    );

    const centers = await getCostCenters("legacy-firebase-user");

    expect(fetchMock).toHaveBeenCalledWith("/api/cost-centers", {
      method: "GET",
      credentials: "same-origin",
    });
    expect(collection).not.toHaveBeenCalled();
    expect(centers[0]).toMatchObject({
      id: "cost-center-1",
      userId: "session-user",
      name: "Automobile",
    });
    expect(centers[0].createdAt).toBeInstanceOf(Date);
  });

  it("creates cost centers through the local API", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        id: "cost-center-1",
        userId: "session-user",
        name: "Automobile",
        createdAt: "2026-05-22T08:00:00.000Z",
        updatedAt: "2026-05-22T08:00:00.000Z",
      }, { status: 201 })
    );

    await createCostCenter("legacy-firebase-user", {
      name: "Automobile",
      color: "#3b82f6",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/cost-centers", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Automobile", color: "#3b82f6" }),
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("updates cost centers through the local API and keeps the legacy signature", async () => {
    const costCenter: CostCenter = {
      id: "cost-center-1",
      userId: "session-user",
      name: "Automobile",
      createdAt: new Date("2026-05-22T08:00:00.000Z"),
      updatedAt: new Date("2026-05-22T08:00:00.000Z"),
    };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...costCenter,
        name: "Auto nuova",
        updatedAt: "2026-05-22T09:00:00.000Z",
      })
    );

    await updateCostCenter(costCenter, { name: "Auto nuova" });

    expect(fetchMock).toHaveBeenCalledWith("/api/cost-centers/cost-center-1", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Auto nuova", previousName: "Automobile" }),
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("deletes cost centers through the local API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await deleteCostCenter("legacy-firebase-user", "cost-center-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/cost-centers/cost-center-1", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("lists expenses for a cost center through the local expenses API", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          id: "expense-1",
          userId: "session-user",
          type: "variable",
          categoryId: "cat-1",
          categoryName: "Auto",
          amount: -25,
          currency: "EUR",
          date: "2026-05-20T00:00:00.000Z",
          costCenterId: "cost-center-1",
          costCenterName: "Automobile",
          createdAt: "2026-05-22T08:00:00.000Z",
          updatedAt: "2026-05-22T08:00:00.000Z",
        },
      ])
    );

    const expenses = await getExpensesForCostCenter("legacy-firebase-user", "cost-center-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/expenses?costCenterId=cost-center-1&sort=asc",
      {
        method: "GET",
        credentials: "same-origin",
      }
    );
    expect(collection).not.toHaveBeenCalled();
    expect(expenses[0].date).toBeInstanceOf(Date);
  });

  it("surfaces local API errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Non autorizzato" }, { status: 401 }));

    await expect(getCostCenters("legacy-firebase-user")).rejects.toThrow("Non autorizzato");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInvestmentOperation,
  deleteInvestmentOperation,
  getInvestmentOperations,
  getRealizedInvestmentSummary,
  updateInvestmentOperation,
} from "@/lib/services/localInvestmentOperationService";

describe("investment operation service API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads operations through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInvestmentOperations("user-1")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/investment-operations", {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
  });

  it("loads realized summary through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ sellsCount: 0, byAsset: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRealizedInvestmentSummary("user-1")).resolves.toEqual({
      sellsCount: 0,
      byAsset: [],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/investment-operations/realized-summary",
      {
        method: "GET",
        headers: { "content-type": "application/json" },
      }
    );
  });

  it("creates operations through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "operation-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createInvestmentOperation("user-1", {
        assetId: "asset-1",
        type: "buy",
        quantity: 2,
        pricePerUnit: 100,
        date: new Date("2026-05-17T00:00:00.000Z"),
      })
    ).resolves.toBe("operation-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/investment-operations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetId: "asset-1",
        type: "buy",
        quantity: 2,
        pricePerUnit: 100,
        date: "2026-05-17T00:00:00.000Z",
      }),
    });
  });

  it("updates operations through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "operation-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateInvestmentOperation("operation-1", {
        assetId: "asset-1",
        type: "buy",
        quantity: 1,
        pricePerUnit: 110,
        date: new Date("2026-05-18T00:00:00.000Z"),
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/investment-operations/operation-1",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("deletes operations through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteInvestmentOperation("operation-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/investment-operations/operation-1",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      }
    );
  });
});

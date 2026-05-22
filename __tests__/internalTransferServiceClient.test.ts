import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInternalTransfer,
  deleteInternalTransfer,
  getInternalTransfers,
  updateInternalTransfer,
} from "@/lib/services/internalTransferService";

describe("internal transfer service API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads transfers through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInternalTransfers("user-1")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/internal-transfers", {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
  });

  it("creates transfers through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "transfer-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createInternalTransfer("user-1", {
        fromCashAssetId: "cash-1",
        toCashAssetId: "cash-2",
        amount: 250,
        date: new Date("2026-05-17T00:00:00.000Z"),
      })
    ).resolves.toBe("transfer-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/internal-transfers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fromCashAssetId: "cash-1",
        toCashAssetId: "cash-2",
        amount: 250,
        date: "2026-05-17T00:00:00.000Z",
      }),
    });
  });

  it("updates transfers through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: "transfer-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateInternalTransfer("transfer-1", {
        fromCashAssetId: "cash-1",
        toCashAssetId: "cash-2",
        amount: 100,
        date: new Date("2026-05-18T00:00:00.000Z"),
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/internal-transfers/transfer-1",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("deletes transfers through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteInternalTransfer("transfer-1")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/internal-transfers/transfer-1",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      }
    );
  });
});

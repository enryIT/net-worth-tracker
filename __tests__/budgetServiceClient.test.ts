import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBudgetConfig,
  saveBudgetConfig,
} from "@/lib/services/budgetService";

describe("budget service API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the authenticated user's budget config through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        userId: "user-1",
        items: [],
        updatedAt: "2026-05-17T10:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBudgetConfig("user-1")).resolves.toEqual({
      userId: "user-1",
      items: [],
      updatedAt: "2026-05-17T10:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/budget", {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
  });

  it("saves budget items through the local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        userId: "user-1",
        items: [],
        updatedAt: "2026-05-17T10:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveBudgetConfig("user-1", [])).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/budget", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });
  });

  it("throws an Italian error message when the API rejects a save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          error: "Budget non valido.",
        }),
      })
    );

    await expect(saveBudgetConfig("user-1", [])).rejects.toThrow(
      "Budget non valido."
    );
  });
});

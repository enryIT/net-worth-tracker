import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  calculateCurrentAllocation,
  getSettings,
  getTargets,
  setSettings,
  setTargets,
} from "@/lib/services/assetAllocationService";
import type { AssetAllocationSettings } from "@/types/assets";

describe("asset allocation service local settings migration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads allocation settings through the local user settings API", async () => {
    const settings: AssetAllocationSettings = {
      userAge: 42,
      riskFreeRate: 2,
      targets: {
        equity: { targetPercentage: 60 },
        bonds: { targetPercentage: 40 },
      },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(settings),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSettings("user-1")).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledWith("/api/user/settings", {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
  });

  it("loads legacy targets from local settings", async () => {
    const targets = { equity: { targetPercentage: 100 } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ targets }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTargets("user-1")).resolves.toEqual(targets);
  });

  it("saves allocation settings through the local user settings API and invalidates affected summaries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      setSettings("user-1", {
        targets: {},
        stampDutyEnabled: true,
        coastFirePensions: [
          {
            id: "pension-1",
            label: "Pensione",
            grossMonthlyAmount: 1200,
            monthsPerYear: 13,
            startAge: 67,
          },
        ],
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/user/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targets: {},
        stampDutyEnabled: true,
        coastFirePensions: [
          {
            id: "pension-1",
            label: "Pensione",
            grossMonthlyAmount: 1200,
            monthsPerYear: 13,
            startAge: 67,
          },
        ],
      }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/dashboard/overview/invalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "overview_settings_updated" }),
    });
  });

  it("saves legacy targets through the same local API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const targets = { cash: { targetPercentage: 100 } };
    await expect(setTargets("user-1", targets)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith("/api/user/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targets }),
    });
  });

  it("keeps allocation calculations local without importing assetService", () => {
    expect(
      calculateCurrentAllocation([
        {
          id: "asset-1",
          userId: "user-1",
          name: "ETF",
          ticker: "ETF",
          type: "etf",
          assetClass: "equity",
          subCategory: "ETF azionario",
          quantity: 2,
          currentPrice: 100,
          currency: "EUR",
          lastPriceUpdate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]).totalValue
    ).toBe(200);

    const source = readFileSync(
      resolve(process.cwd(), "lib/services/assetAllocationService.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/firebase\/firestore|lib\/firebase\/config|\.\/assetService/);
  });
});

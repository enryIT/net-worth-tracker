import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  calculateCurrentYieldMetricsMock,
  calculateYocMetricsMock,
  listLocalAssetsMock,
  listLocalDividendsMock,
} = vi.hoisted(() => ({
  calculateCurrentYieldMetricsMock: vi.fn(),
  calculateYocMetricsMock: vi.fn(),
  listLocalAssetsMock: vi.fn(),
  listLocalDividendsMock: vi.fn(),
}));

vi.mock("@/lib/server/assets/localAssetService", () => ({
  listLocalAssets: listLocalAssetsMock,
}));

vi.mock("@/lib/server/dividends/localDividendService", () => ({
  listLocalDividends: listLocalDividendsMock,
}));

vi.mock("@/lib/services/performanceService", () => ({
  calculateCurrentYieldMetrics: calculateCurrentYieldMetricsMock,
  calculateYocMetrics: calculateYocMetricsMock,
}));

import {
  getLocalCurrentYieldMetrics,
  getLocalYocMetrics,
} from "@/lib/server/performance/localYieldMetricsService";

const period = {
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  dividendEndDate: new Date("2026-12-31T23:59:59.999Z"),
  numberOfMonths: 12,
};

describe("local performance yield metrics service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listLocalDividendsMock.mockResolvedValue([{ id: "dividend-1" }]);
    listLocalAssetsMock.mockResolvedValue([{ id: "asset-1" }]);
    calculateYocMetricsMock.mockReturnValue({ yocGross: 4.2 });
    calculateCurrentYieldMetricsMock.mockReturnValue({ currentYield: 3.1 });
  });

  it("calculates YOC metrics from local dividends and assets", async () => {
    const result = await getLocalYocMetrics("user-1", period);

    expect(listLocalDividendsMock).toHaveBeenCalledWith("user-1");
    expect(listLocalAssetsMock).toHaveBeenCalledWith("user-1");
    expect(calculateYocMetricsMock).toHaveBeenCalledWith(
      [{ id: "dividend-1" }],
      [{ id: "asset-1" }],
      period.startDate,
      period.dividendEndDate,
      period.numberOfMonths
    );
    expect(result).toEqual({ yocGross: 4.2 });
  });

  it("calculates current yield metrics from local dividends and assets", async () => {
    const result = await getLocalCurrentYieldMetrics("user-1", period);

    expect(listLocalDividendsMock).toHaveBeenCalledWith("user-1");
    expect(listLocalAssetsMock).toHaveBeenCalledWith("user-1");
    expect(calculateCurrentYieldMetricsMock).toHaveBeenCalledWith(
      [{ id: "dividend-1" }],
      [{ id: "asset-1" }],
      period.startDate,
      period.dividendEndDate,
      period.numberOfMonths
    );
    expect(result).toEqual({ currentYield: 3.1 });
  });
});

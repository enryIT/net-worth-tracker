import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { runLocalDailyDividendProcessingMock } = vi.hoisted(() => ({
  runLocalDailyDividendProcessingMock: vi.fn(),
}));

vi.mock("@/lib/server/dividends/localDailyDividendProcessor", () => ({
  runLocalDailyDividendProcessing: runLocalDailyDividendProcessingMock,
}));

import { GET } from "@/app/api/cron/daily-dividend-processing/route";

describe("local daily dividend cron route", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    runLocalDailyDividendProcessingMock.mockResolvedValue({
      success: true,
      message: "Daily dividend processing job completed",
      timestamp: "2026-05-17T00:00:00.000Z",
      scraping: { assetsScraped: 1, newDividends: 1, errors: 0 },
      expenseCreation: {
        processedCount: 2,
        errorCount: 0,
        processedDividends: [],
        errors: [],
      },
      couponScheduling: { scheduled: 1, skipped: 0, errors: 0 },
    });
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/daily-dividend-processing")
    );

    expect(response.status).toBe(401);
    expect(runLocalDailyDividendProcessingMock).not.toHaveBeenCalled();
  });

  it("runs local daily dividend processing for authorized cron callers", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/daily-dividend-processing", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(runLocalDailyDividendProcessingMock).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Daily dividend processing job completed",
      timestamp: "2026-05-17T00:00:00.000Z",
      scraping: { assetsScraped: 1, newDividends: 1, errors: 0 },
      expenseCreation: {
        processedCount: 2,
        errorCount: 0,
        processedDividends: [],
        errors: [],
      },
      couponScheduling: { scheduled: 1, skipped: 0, errors: 0 },
    });
  });
});

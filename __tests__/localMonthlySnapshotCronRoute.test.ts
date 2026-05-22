import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { runLocalMonthlySnapshotCronMock } = vi.hoisted(() => ({
  runLocalMonthlySnapshotCronMock: vi.fn(),
}));

vi.mock("@/lib/server/snapshots/localMonthlySnapshotCronService", () => ({
  runLocalMonthlySnapshotCron: runLocalMonthlySnapshotCronMock,
}));

import { GET } from "@/app/api/cron/monthly-snapshot/route";

describe("local monthly snapshot cron route", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    runLocalMonthlySnapshotCronMock.mockResolvedValue({
      success: true,
      message: "Monthly snapshots job completed",
      timestamp: "2026-05-19T21:30:00.000Z",
      snapshotsCreated: 1,
      errors: 0,
      results: [{ userId: "user-1", snapshotId: "user-1-2026-5", message: "ok" }],
      errorDetails: [],
      emailSummary: { sent: 0, skipped: 0, errors: 0 },
      quarterlyEmailSummary: { sent: 0, skipped: 0, errors: 0 },
      yearlyEmailSummary: { sent: 0, skipped: 0, errors: 0 },
    });
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects requests without the cron bearer token", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/monthly-snapshot")
    );

    expect(response.status).toBe(401);
    expect(runLocalMonthlySnapshotCronMock).not.toHaveBeenCalled();
  });

  it("runs local monthly snapshots for authorized cron callers", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/monthly-snapshot", {
        headers: { authorization: "Bearer test-cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(runLocalMonthlySnapshotCronMock).toHaveBeenCalledWith();
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Monthly snapshots job completed",
      timestamp: "2026-05-19T21:30:00.000Z",
      snapshotsCreated: 1,
      errors: 0,
      results: [{ userId: "user-1", snapshotId: "user-1-2026-5", message: "ok" }],
      errorDetails: [],
      emailSummary: { sent: 0, skipped: 0, errors: 0 },
      quarterlyEmailSummary: { sent: 0, skipped: 0, errors: 0 },
      yearlyEmailSummary: { sent: 0, skipped: 0, errors: 0 },
    });
  });
});

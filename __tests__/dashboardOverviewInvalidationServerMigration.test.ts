import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invalidateLocalDashboardOverviewSummaryMock = vi.fn();

vi.mock("@/lib/server/dashboard/localDashboardOverviewInvalidationService", () => ({
  invalidateLocalDashboardOverviewSummary: invalidateLocalDashboardOverviewSummaryMock,
}));

const forbiddenFirebaseRuntime = /from ['"]firebase-admin\/firestore['"]|from ['"]@\/lib\/firebase\/admin['"]|adminDb|Timestamp/;

describe("dashboard overview server invalidation migration", () => {
  beforeEach(() => {
    vi.resetModules();
    invalidateLocalDashboardOverviewSummaryMock.mockReset();
  });

  it("keeps the legacy server helper free of Firebase Admin runtime imports", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/services/dashboardOverviewInvalidation.server.ts"),
      "utf8"
    );

    expect(source).not.toMatch(forbiddenFirebaseRuntime);
  });

  it("delegates legacy server invalidation calls to the local Prisma-backed service", async () => {
    const { invalidateDashboardOverviewSummaryServer } = await import(
      "@/lib/services/dashboardOverviewInvalidation.server"
    );

    await invalidateDashboardOverviewSummaryServer("user-1", "asset_update");

    expect(invalidateLocalDashboardOverviewSummaryMock).toHaveBeenCalledWith(
      "user-1",
      "asset_update"
    );
  });
});

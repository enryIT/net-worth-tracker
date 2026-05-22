import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    dashboardOverviewSummary: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import { invalidateLocalDashboardOverviewSummary } from "@/lib/server/dashboard/localDashboardOverviewInvalidationService";
import { DASHBOARD_OVERVIEW_SOURCE_VERSION } from "@/lib/services/dashboardOverviewConstants";

describe("local dashboard overview invalidation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the authenticated user's overview summary stale in Postgres", async () => {
    await invalidateLocalDashboardOverviewSummary("user-1", "expense_created");

    expect(prismaMock.dashboardOverviewSummary.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        invalidatedAt: expect.any(Date),
        lastInvalidationReason: "expense_created",
      },
      update: {
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        invalidatedAt: expect.any(Date),
        lastInvalidationReason: "expense_created",
      },
    });
  });
});

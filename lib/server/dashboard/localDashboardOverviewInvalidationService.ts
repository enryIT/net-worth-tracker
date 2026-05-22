import "server-only";

import { prisma } from "@/lib/server/prisma";
import { DASHBOARD_OVERVIEW_SOURCE_VERSION } from "@/lib/services/dashboardOverviewConstants";

export async function invalidateLocalDashboardOverviewSummary(
  userId: string,
  reason: string
): Promise<void> {
  const invalidatedAt = new Date();

  await prisma.dashboardOverviewSummary.upsert({
    where: { userId },
    create: {
      userId,
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      invalidatedAt,
      lastInvalidationReason: reason,
    },
    update: {
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      invalidatedAt,
      lastInvalidationReason: reason,
    },
  });
}

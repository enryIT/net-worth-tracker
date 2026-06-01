import "server-only";

import { getLocalDashboardOverview } from "@/lib/server/dashboard/localDashboardOverviewService";
import type { DashboardOverviewPayload } from "@/types/dashboardOverview";

export async function getDashboardOverview(
  userId: string
): Promise<DashboardOverviewPayload> {
  return getLocalDashboardOverview(userId);
}

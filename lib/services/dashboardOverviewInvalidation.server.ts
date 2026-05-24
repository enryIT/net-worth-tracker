import { invalidateLocalDashboardOverviewSummary } from '@/lib/server/dashboard/localDashboardOverviewInvalidationService';

/**
 * Server-side compatibility wrapper for overview summary invalidation.
 *
 * Legacy callers keep importing this module, while persistence is owned by the
 * local Prisma-backed dashboard overview invalidation service.
 */
export async function invalidateDashboardOverviewSummaryServer(
  userId: string,
  reason: string
): Promise<void> {
  try {
    await invalidateLocalDashboardOverviewSummary(userId, reason);
  } catch (error) {
    console.warn('[dashboardOverviewInvalidationServer] Failed to mark summary stale:', error);
  }
}

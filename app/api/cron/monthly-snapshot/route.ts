import { NextRequest, NextResponse } from "next/server";
import { runLocalMonthlySnapshotCron } from "@/lib/server/snapshots/localMonthlySnapshotCronService";

/**
 * GET /api/cron/monthly-snapshot
 *
 * Daily automated snapshot creation cron job.
 * Requires Authorization: Bearer ${CRON_SECRET}.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await runLocalMonthlySnapshotCron());
  } catch (error) {
    console.error("[LOCAL_MONTHLY_SNAPSHOT_CRON_ROUTE_ERROR]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to execute monthly snapshot job",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

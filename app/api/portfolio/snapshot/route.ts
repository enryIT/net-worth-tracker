import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { createLocalAutomatedSnapshot } from "@/lib/server/snapshots/localAutomatedSnapshotService";

const snapshotRequestSchema = z.object({
  userId: z.string().min(1).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  cronSecret: z.string().optional(),
});

/**
 * POST /api/portfolio/snapshot
 *
 * Create or update monthly snapshot of portfolio state
 *
 * Orchestrates multiple services:
 *   1. Price updates (Yahoo Finance)
 *   2. Asset value calculations
 *   3. Allocation calculations
 *   4. Snapshot persistence
 *
 * Request Body:
 *   {
 *     userId: string,
 *     year?: number,      // Optional: defaults to current Italy year
 *     month?: number,     // Optional: defaults to current Italy month (1-12)
 *     cronSecret?: string // Optional: for cron job authorization
 *   }
 *
 * Snapshot Structure:
 *   - One document per user per month
 *   - Document ID: "{userId}-{year}-{M}"
 *   - Contains: net worth, allocations, per-asset breakdown
 *
 * Idempotency:
 *   - If snapshot exists for year/month: Updates (overwrites)
 *   - If new: Creates
 *   - Uses the local snapshot upsert service for one record per month
 *
 * Hall of Fame Integration:
 *   - NOT called here (see lines 120-121)
 *   - Client-side triggers update after success
 *   - Rationale: Client controls timing for UI feedback
 *
 * Related:
 *   - portfolio/snapshot/manual/route.ts: Manual snapshot with validation
 *   - cron/monthly-snapshot/route.ts: Scheduled monthly snapshots
 *   - hallOfFameService.server.ts: Ranking updates
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsedBody = snapshotRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Richiesta snapshot non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { cronSecret, month, userId, year } = parsedBody.data;

    if (cronSecret) {
      if (cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Invalid cron secret" }, { status: 401 });
      }

      if (!userId) {
        return NextResponse.json({ error: "User ID is required" }, { status: 400 });
      }

      return NextResponse.json(
        await createLocalAutomatedSnapshot(userId, { year, month })
      );
    }

    const user = await requireUserSession();
    assertWritableUser(user);

    return NextResponse.json(
      await createLocalAutomatedSnapshot(user.id, { year, month })
    );
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_AUTOMATED_SNAPSHOT_ROUTE_ERROR]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Si e verificato un errore durante la creazione snapshot.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

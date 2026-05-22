import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { createLocalManualSnapshot } from "@/lib/server/snapshots/localManualSnapshotService";

const numberRecordSchema = z.record(z.string(), z.number());

const ownershipSplitSchema = z.object({
  participantId: z.string().min(1),
  participantName: z.string().min(1),
  percentage: z.number(),
});

const ownershipProfileBreakdownSchema = z.object({
  profileName: z.string().min(1),
  totalValue: z.number(),
});

const participantBreakdownSchema = z.object({
  participantName: z.string().min(1),
  totalValue: z.number(),
});

const manualSnapshotAssetSchema = z.object({
  assetId: z.string().min(1),
  ticker: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number(),
  price: z.number(),
  totalValue: z.number(),
  ownershipProfileId: z.string().optional(),
  ownershipProfileName: z.string().optional(),
  ownershipSplits: z.array(ownershipSplitSchema).optional(),
});

const manualSnapshotSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12),
  totalNetWorth: z.number(),
  liquidNetWorth: z.number(),
  illiquidNetWorth: z.number(),
  fireNetWorth: z.number().optional(),
  byAssetClass: numberRecordSchema,
  byAsset: z.array(manualSnapshotAssetSchema).default([]),
  byOwnershipProfile: z.record(z.string(), ownershipProfileBreakdownSchema).optional(),
  byParticipant: z.record(z.string(), participantBreakdownSchema).optional(),
  assetAllocation: numberRecordSchema,
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/portfolio/snapshot/manual
 *
 * Create manual snapshot with explicit data (no automatic calculations)
 *
 * Use Case:
 *   - Import historical snapshots from external sources
 *   - Override automated snapshot calculations
 *   - Bulk snapshot creation from CSV imports
 *
 * Differences from /api/portfolio/snapshot:
 *   - Requires complete snapshot data in request body
 *   - No price fetching or calculation steps
 *   - More extensive validation (all fields required)
 *   - Always triggers Hall of Fame update (server-side)
 *
 * Request Body (all fields required):
 *   {
 *     userId: string,
 *     year: number,              // 1900-2100
 *     month: number,             // 1-12
 *     totalNetWorth: number,
 *     liquidNetWorth: number,
 *     illiquidNetWorth: number,
 *     byAssetClass: { [key: string]: number },
 *     assetAllocation: { [key: string]: number },
 *     byAsset?: Array<{
 *       assetId: string,
 *       ticker: string,
 *       name: string,
 *       quantity: number,
 *       price: number,
 *       totalValue: number
 *     }>
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     snapshotId: string,  // Format: "{userId}-{year}-{MM}"
 *     message: string
 *   }
 *
 * Related:
 *   - portfolio/snapshot/route.ts: Automated snapshot creation
 *   - hallOfFameService.server.ts: Triggered on success
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = manualSnapshotSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Snapshot manuale non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await createLocalManualSnapshot(user.id, parsedBody.data)
    );
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_MANUAL_SNAPSHOT_ROUTE_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante la creazione snapshot." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  listLocalSnapshots,
  upsertLocalSnapshot,
} from "@/lib/server/snapshots/localSnapshotService";

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

const snapshotAssetSchema = z.object({
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

const snapshotSchema = z.object({
  year: z.number().int().min(1900).max(2100),
  month: z.number().int().min(1).max(12),
  isDummy: z.boolean().optional(),
  totalNetWorth: z.number(),
  liquidNetWorth: z.number(),
  illiquidNetWorth: z.number(),
  fireNetWorth: z.number().optional(),
  byAssetClass: numberRecordSchema,
  byAsset: z.array(snapshotAssetSchema),
  byOwnershipProfile: z.record(z.string(), ownershipProfileBreakdownSchema).optional(),
  byParticipant: z.record(z.string(), participantBreakdownSchema).optional(),
  assetAllocation: numberRecordSchema,
  note: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await listLocalSnapshots(user.id));
  } catch (error) {
    return handleSnapshotRouteError(error, "[LOCAL_SNAPSHOTS_GET_ERROR]");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = snapshotSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Snapshot non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await upsertLocalSnapshot(user.id, parsedBody.data),
      { status: 201 }
    );
  } catch (error) {
    return handleSnapshotRouteError(error, "[LOCAL_SNAPSHOTS_POST_ERROR]");
  }
}

function handleSnapshotRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione snapshot." },
    { status: 500 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  appendLocalHouseholdAuditEntry,
  getLocalHouseholdAuditEntries,
} from "@/lib/server/household/localHouseholdService";
import type { HouseholdAuditEntityType } from "@/types/household";

const householdAuditSchema = z.object({
  entityType: z.enum([
    "asset",
    "expense",
    "internalTransfer",
    "budget",
    "householdConfig",
    "snapshot",
  ]),
  entityId: z.string().min(1),
  action: z.enum(["create", "update", "delete", "snapshot"]),
  summary: z.string().min(1),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 100;

    return NextResponse.json(
      await getLocalHouseholdAuditEntries(
        user.id,
        Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 250) : 100
      )
    );
  } catch (error) {
    return handleHouseholdRouteError(error, "HOUSEHOLD_AUDIT_GET_ERROR");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = householdAuditSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Evento household non valido." },
        { status: 400 }
      );
    }

    await appendLocalHouseholdAuditEntry(user.id, {
      ...parsedBody.data,
      entityType: parsedBody.data.entityType as HouseholdAuditEntityType,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleHouseholdRouteError(error, "HOUSEHOLD_AUDIT_POST_ERROR");
  }
}

function handleHouseholdRouteError(error: unknown, code: string): NextResponse {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(`[${code}]`, error);
  return NextResponse.json(
    { error: "Errore durante la gestione household." },
    { status: 500 }
  );
}

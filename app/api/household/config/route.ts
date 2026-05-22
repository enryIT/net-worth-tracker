import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  getLocalHouseholdConfig,
  saveLocalHouseholdConfig,
} from "@/lib/server/household/localHouseholdService";
import type { HouseholdConfig } from "@/types/household";

const householdConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => !Array.isArray(value), {
    message: "Configurazione household non valida.",
  });

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalHouseholdConfig(user.id));
  } catch (error) {
    return handleHouseholdRouteError(error, "HOUSEHOLD_CONFIG_GET_ERROR");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = householdConfigSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Configurazione household non valida." },
        { status: 400 }
      );
    }

    await saveLocalHouseholdConfig(user.id, {
      ...parsedBody.data,
      userId: user.id,
    } as HouseholdConfig);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleHouseholdRouteError(error, "HOUSEHOLD_CONFIG_PUT_ERROR");
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

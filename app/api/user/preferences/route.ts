import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  getLocalUserPreferences,
  setLocalUserPreferences,
} from "@/lib/server/settings/localUserPreferencesService";

const colorThemeSchema = z.enum([
  "default",
  "solar-dusk",
  "elegant-luxury",
  "midnight-bloom",
  "cyberpunk",
  "retro-arcade",
]);

const preferencesPatchSchema = z.object({
  colorTheme: colorThemeSchema.optional(),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalUserPreferences(user.id));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[USER_PREFERENCES_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il caricamento preferenze." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = preferencesPatchSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Preferenze non valide." },
        { status: 400 }
      );
    }

    await setLocalUserPreferences(user.id, parsedBody.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[USER_PREFERENCES_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il salvataggio preferenze." },
      { status: 500 }
    );
  }
}

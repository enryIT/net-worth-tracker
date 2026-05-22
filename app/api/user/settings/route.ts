import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  getLocalSettings,
  setLocalSettings,
} from "@/lib/server/settings/localSettingsService";

const settingsPatchSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => !Array.isArray(value), {
    message: "Impostazioni non valide.",
  });

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalSettings(user.id));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[USER_SETTINGS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il caricamento impostazioni." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = settingsPatchSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Impostazioni non valide." },
        { status: 400 }
      );
    }

    await setLocalSettings(user.id, parsedBody.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[USER_SETTINGS_PATCH_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il salvataggio impostazioni." },
      { status: 500 }
    );
  }
}

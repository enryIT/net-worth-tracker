import { NextResponse } from "next/server";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { startTotpEnrollment } from "@/lib/server/auth/totpEnrollmentService";

export async function POST() {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    return NextResponse.json(await startTotpEnrollment(user));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[TOTP_START_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante la configurazione 2FA." },
      { status: 500 }
    );
  }
}

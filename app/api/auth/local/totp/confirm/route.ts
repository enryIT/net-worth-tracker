import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  confirmTotpEnrollment,
  TotpEnrollmentError,
} from "@/lib/server/auth/totpEnrollmentService";

const confirmTotpSchema = z.object({
  token: z.string().regex(/^\d{6}$/, {
    message: "Inserisci un codice 2FA di 6 cifre.",
  }),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = confirmTotpSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error:
            parsedBody.error.issues[0]?.message ??
            "Codice 2FA non valido.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await confirmTotpEnrollment(user, parsedBody.data.token)
    );
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    if (error instanceof TotpEnrollmentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[TOTP_CONFIRM_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante la conferma 2FA." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { importUserData } from "@/lib/server/portability/appDataService";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const summary = await importUserData(user, body);

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[APP_DATA_IMPORT_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante l'importazione." },
      { status: 500 }
    );
  }
}

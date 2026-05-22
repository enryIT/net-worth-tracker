import { NextResponse } from "next/server";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { exportUserData } from "@/lib/server/portability/appDataService";

export async function GET() {
  try {
    const user = await requireUserSession();
    const envelope = await exportUserData(user);

    return NextResponse.json(envelope);
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[APP_DATA_EXPORT_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante l'esportazione." },
      { status: 500 }
    );
  }
}

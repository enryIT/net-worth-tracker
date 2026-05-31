import { NextResponse } from "next/server";
import { AuthSessionError, requireUserSession } from "@/lib/server/auth/session";
import { getLocalHallOfFameData } from "@/lib/server/hall-of-fame/localHallOfFameService";

export async function GET() {
  try {
    const user = await requireUserSession();
    const hallOfFameData = await getLocalHallOfFameData(user.id);

    return NextResponse.json(hallOfFameData);
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_HALL_OF_FAME_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Si è verificato un errore durante il recupero Hall of Fame." },
      { status: 500 }
    );
  }
}

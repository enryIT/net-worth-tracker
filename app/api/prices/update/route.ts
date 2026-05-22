import { NextRequest, NextResponse } from "next/server";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { updateLocalUserAssetPrices } from "@/lib/server/prices/localPriceUpdateService";

export async function POST(_request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    return NextResponse.json(await updateLocalUserAssetPrices(user.id));
  } catch (error) {
    return handlePriceUpdateRouteError(error);
  }
}

function handlePriceUpdateRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error("[LOCAL_PRICE_UPDATE_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante l'aggiornamento prezzi." },
    { status: 500 }
  );
}

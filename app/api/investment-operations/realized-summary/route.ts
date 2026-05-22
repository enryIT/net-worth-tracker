import { NextResponse } from "next/server";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { getLocalRealizedInvestmentSummary } from "@/lib/server/cashflow/localInvestmentOperationService";

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalRealizedInvestmentSummary(user.id));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_INVESTMENT_REALIZED_SUMMARY_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il riepilogo realizzato." },
      { status: 500 }
    );
  }
}

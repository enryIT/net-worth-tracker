import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthSessionError, requireUserSession } from "@/lib/server/auth/session";
import { getLocalMonthlyExpenseSummary } from "@/lib/server/cashflow/localExpenseService";

const summaryQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const parsedQuery = summaryQuerySchema.safeParse({
      year: request.nextUrl.searchParams.get("year") ?? undefined,
      month: request.nextUrl.searchParams.get("month") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Periodo riepilogo non valido.", issues: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await getLocalMonthlyExpenseSummary(
        user.id,
        parsedQuery.data.year,
        parsedQuery.data.month
      )
    );
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_EXPENSE_SUMMARY_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il riepilogo movimenti." },
      { status: 500 }
    );
  }
}

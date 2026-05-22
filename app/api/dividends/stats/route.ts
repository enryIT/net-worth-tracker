import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { getLocalDividendStats } from "@/lib/server/dividends/localDividendStatsService";

const dateFromInputSchema = z.preprocess((value) => {
  if (typeof value === "string" || value instanceof Date) {
    return new Date(value);
  }

  return value;
}, z.date());

const statsQuerySchema = z.object({
  assetId: z.string().min(1).optional(),
  startDate: dateFromInputSchema.optional(),
  endDate: dateFromInputSchema.optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const searchParams = request.nextUrl.searchParams;
    const parsedQuery = statsQuerySchema.safeParse({
      assetId: searchParams.get("assetId") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Filtro statistiche dividendi non valido.", issues: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await getLocalDividendStats(user.id, parsedQuery.data)
    );
  } catch (error) {
    return handleDividendStatsRouteError(error);
  }
}

function handleDividendStatsRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error("[LOCAL_DIVIDEND_STATS_GET_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante il calcolo statistiche dividendi." },
    { status: 500 }
  );
}

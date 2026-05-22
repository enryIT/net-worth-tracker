import { NextRequest, NextResponse } from "next/server";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { getLocalCurrentYieldMetrics } from "@/lib/server/performance/localYieldMetricsService";
import { parsePerformancePeriodQuery } from "../periodQuery";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const periodQuery = parsePerformancePeriodQuery(request.nextUrl.searchParams);

    if (!periodQuery.ok) {
      return NextResponse.json(
        { error: periodQuery.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await getLocalCurrentYieldMetrics(user.id, periodQuery.value)
    );
  } catch (error) {
    return handlePerformanceYieldRouteError(error, "[LOCAL_PERFORMANCE_CURRENT_YIELD_ERROR]");
  }
}

function handlePerformanceYieldRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante il calcolo rendimento." },
    { status: 500 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { getLocalFxRates } from "@/lib/server/benchmarks/localBenchmarkCacheService";

export async function GET(request: NextRequest) {
  try {
    await requireUserSession();
    return NextResponse.json(await getLocalFxRates());
  } catch (error) {
    return handleBenchmarkRouteError(error);
  }
}

function handleBenchmarkRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error("[LOCAL_BENCHMARK_FX_RATES_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante il recupero dei tassi FX." },
    { status: 500 }
  );
}

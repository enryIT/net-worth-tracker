import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { getLocalBenchmarkReturns } from "@/lib/server/benchmarks/localBenchmarkCacheService";

const benchmarkReturnsQuerySchema = z.object({
  benchmarkId: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  try {
    await requireUserSession();

    const parsedQuery = benchmarkReturnsQuerySchema.safeParse({
      benchmarkId: request.nextUrl.searchParams.get("benchmarkId"),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Benchmark non valido.", issues: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await getLocalBenchmarkReturns(parsedQuery.data.benchmarkId)
    );
  } catch (error) {
    return handleBenchmarkReturnsRouteError(error);
  }
}

function handleBenchmarkReturnsRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  if (error instanceof Error && error.message === "BENCHMARK_NOT_FOUND") {
    return NextResponse.json({ error: "Benchmark non trovato." }, { status: 404 });
  }

  console.error("[LOCAL_BENCHMARK_RETURNS_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante il recupero benchmark." },
    { status: 500 }
  );
}

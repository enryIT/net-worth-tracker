import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { analyzeLocalPerformance } from "@/lib/server/ai/localAnalyzePerformanceService";
import type { PerformanceMetrics } from "@/types/performance";

const nullableNumberSchema = z.number().nullable();

const performanceMetricsSchema = z.object({
  timePeriod: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  dividendEndDate: z.coerce.date(),
  startNetWorth: z.number(),
  endNetWorth: z.number(),
  cashFlows: z.array(z.unknown()).default([]),
  roi: nullableNumberSchema,
  cagr: nullableNumberSchema,
  timeWeightedReturn: nullableNumberSchema,
  moneyWeightedReturn: nullableNumberSchema,
  sharpeRatio: nullableNumberSchema,
  volatility: nullableNumberSchema,
  maxDrawdown: nullableNumberSchema,
  drawdownDuration: nullableNumberSchema,
  recoveryTime: nullableNumberSchema,
  maxDrawdownDate: z.string().optional(),
  drawdownPeriod: z.string().optional(),
  recoveryPeriod: z.string().optional(),
  riskFreeRate: z.number(),
  dividendCategoryId: z.string().optional(),
  totalContributions: z.number(),
  totalWithdrawals: z.number(),
  netCashFlow: z.number(),
  totalIncome: z.number(),
  totalExpenses: z.number(),
  totalDividendIncome: z.number(),
  numberOfMonths: z.number(),
  yocGross: nullableNumberSchema,
  yocNet: nullableNumberSchema,
  yocDividendsGross: z.number(),
  yocDividendsNet: z.number(),
  yocCostBasis: z.number(),
  yocAssetCount: z.number(),
  currentYield: nullableNumberSchema,
  currentYieldNet: nullableNumberSchema,
  currentYieldDividends: z.number(),
  currentYieldDividendsNet: z.number(),
  currentYieldPortfolioValue: z.number(),
  currentYieldAssetCount: z.number(),
  hasInsufficientData: z.boolean(),
  errorMessage: z.string().optional(),
});

const analyzePerformanceRequestSchema = z.object({
  metrics: performanceMetricsSchema,
  timePeriod: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    await requireUserSession();

    const body: unknown = await request.json();
    const parsedBody = analyzePerformanceRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Parametri analisi non validi.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const stream = await analyzeLocalPerformance(
      parsedBody.data.metrics as PerformanceMetrics,
      parsedBody.data.timePeriod
    );

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    if (isOverloadedError(error)) {
      return NextResponse.json(
        {
          error: "I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.",
          retryable: true,
        },
        { status: 503 }
      );
    }

    console.error("[LOCAL_ANALYZE_PERFORMANCE_ROUTE_ERROR]", error);
    return NextResponse.json(
      {
        error: "Failed to generate AI analysis",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function isOverloadedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "type" in error.error &&
    error.error.type === "overloaded_error"
  );
}

import { NextRequest, NextResponse } from "next/server";
import { runLocalDailyDividendProcessing } from "@/lib/server/dividends/localDailyDividendProcessor";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await runLocalDailyDividendProcessing());
  } catch (error) {
    console.error("[LOCAL_DAILY_DIVIDEND_PROCESSING_ERROR]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Si e verificato un errore durante il job dividendi.",
        details: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

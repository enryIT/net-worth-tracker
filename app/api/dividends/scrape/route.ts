import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { scrapeLocalAssetDividends } from "@/lib/server/dividends/localDividendScrapeService";

const scrapeDividendSchema = z.object({
  assetId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = scrapeDividendSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Richiesta importazione dividendi non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await scrapeLocalAssetDividends(user.id, parsedBody.data.assetId)
    );
  } catch (error) {
    return handleDividendScrapeRouteError(error);
  }
}

function handleDividendScrapeRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  if (error instanceof Error && error.message === "ASSET_NOT_FOUND") {
    return NextResponse.json({ error: "Asset non trovato." }, { status: 404 });
  }

  if (error instanceof Error && error.message === "ASSET_MISSING_ISIN") {
    return NextResponse.json(
      { error: "L'asset non ha un codice ISIN configurato." },
      { status: 400 }
    );
  }

  console.error("[LOCAL_DIVIDEND_SCRAPE_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante l'importazione dividendi." },
    { status: 500 }
  );
}

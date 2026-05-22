import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { convertToEur } from "@/lib/services/currencyConversionService";
import { getQuote } from "@/lib/services/yahooFinanceService";

const quoteQuerySchema = z.object({
  ticker: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  try {
    await requireUserSession();

    const parsedQuery = quoteQuerySchema.safeParse({
      ticker: request.nextUrl.searchParams.get("ticker"),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: "Ticker non valido.",
          issues: parsedQuery.error.flatten(),
        },
        { status: 400 }
      );
    }

    const quote = await getQuote(parsedQuery.data.ticker);
    const { price, currency } = normalizeQuotePrice(
      quote.price,
      quote.currency
    );
    let currentPriceEur: number | undefined;

    if (price !== null && currency !== "EUR" && price > 0) {
      try {
        currentPriceEur = await convertToEur(price, currency);
      } catch (error) {
        console.warn("[LOCAL_PRICE_QUOTE_FX_ERROR]", error);
      }
    }

    return NextResponse.json({
      ...quote,
      price,
      currency,
      ...(currentPriceEur !== undefined ? { currentPriceEur } : {}),
    });
  } catch (error) {
    return handlePriceQuoteRouteError(error);
  }
}

function normalizeQuotePrice(price: number | null, currency: string) {
  if (price === null) {
    return { price, currency };
  }

  if (currency === "GBp") {
    return {
      price: price / 100,
      currency: "GBP",
    };
  }

  return { price, currency };
}

function handlePriceQuoteRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error("[LOCAL_PRICE_QUOTE_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante il recupero quotazione." },
    { status: 500 }
  );
}

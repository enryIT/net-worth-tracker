import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { getBondPriceByIsin } from "@/lib/services/borsaItalianaBondScraperService";

const bondQuoteQuerySchema = z.object({
  isin: z
    .string()
    .trim()
    .transform((isin) => isin.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/)),
});

export async function GET(request: NextRequest) {
  try {
    await requireUserSession();

    const parsedQuery = bondQuoteQuerySchema.safeParse({
      isin: request.nextUrl.searchParams.get("isin"),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: "ISIN non valido.",
          issues: parsedQuery.error.flatten(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(await getBondPriceByIsin(parsedQuery.data.isin));
  } catch (error) {
    return handleBondQuoteRouteError(error);
  }
}

function handleBondQuoteRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error("[LOCAL_BOND_QUOTE_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante il recupero quotazione." },
    { status: 500 }
  );
}

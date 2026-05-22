import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  createLocalAsset,
  listLocalAssets,
} from "@/lib/server/assets/localAssetService";

const assetFormSchema = z.object({
  ticker: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum([
    "stock",
    "etf",
    "bond",
    "crypto",
    "commodity",
    "cash",
    "realestate",
    "pensionfund",
  ]),
  assetClass: z.enum([
    "equity",
    "bonds",
    "crypto",
    "realestate",
    "cash",
    "commodity",
  ]),
  subCategory: z.string().optional(),
  currency: z.string().trim().min(1),
  quantity: z.number().min(0),
  currentPrice: z.number().min(0),
  currentPriceEur: z.number().min(0).optional(),
  autoUpdatePrice: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await listLocalAssets(user.id));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_ASSETS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il caricamento asset." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = assetFormSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json({ error: "Asset non valido." }, { status: 400 });
    }

    return NextResponse.json(
      await createLocalAsset(user.id, parsedBody.data),
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_ASSETS_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il salvataggio asset." },
      { status: 500 }
    );
  }
}

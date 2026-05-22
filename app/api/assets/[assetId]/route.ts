import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalAsset,
  updateLocalAsset,
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
  assetClass: z.enum(["equity", "bonds", "crypto", "realestate", "cash", "commodity"]),
  subCategory: z.string().trim().optional(),
  currency: z.string().trim().min(3).max(3),
  quantity: z.number().nonnegative(),
  currentPrice: z.number().nonnegative(),
  currentPriceEur: z.number().nonnegative().optional(),
  autoUpdatePrice: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body = await request.json();
    const assetData = assetFormSchema.parse(body);
    const { assetId } = await context.params;
    const asset = await updateLocalAsset(user.id, assetId, assetData);

    if (!asset) {
      return NextResponse.json({ error: "Asset non trovato." }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    return handleAssetRouteError(error, "Error updating local asset:");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const { assetId } = await context.params;
    const deleted = await deleteLocalAsset(user.id, assetId);

    if (!deleted) {
      return NextResponse.json({ error: "Asset non trovato." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAssetRouteError(error, "Error deleting local asset:");
  }
}

function handleAssetRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Dati asset non validi.", issues: error.flatten() },
      { status: 400 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json({ error: "Errore asset." }, { status: 500 });
}

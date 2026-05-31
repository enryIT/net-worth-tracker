import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalAsset,
  getLocalAssetById,
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
  quantity: z.number(),
  averageCost: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().optional(),
  totalExpenseRatio: z.number().nonnegative().optional(),
  stampDutyExempt: z.boolean().optional(),
  includeInHistoryTables: z.boolean().optional(),
  currentPrice: z.number().nonnegative(),
  currentPriceEur: z.number().nonnegative().optional(),
  isLiquid: z.boolean().optional(),
  autoUpdatePrice: z.boolean().optional(),
  composition: z.array(
    z.object({
      assetClass: z.enum(["equity", "bonds", "crypto", "realestate", "cash", "commodity"]),
      percentage: z.number(),
      subCategory: z.string().optional(),
    })
  ).optional(),
  outstandingDebt: z.number().nonnegative().optional(),
  isPrimaryResidence: z.boolean().optional(),
  isin: z.string().optional(),
  bondDetails: z.object({
    couponRate: z.number(),
    couponFrequency: z.enum(["monthly", "quarterly", "semiannual", "annual"]),
    issueDate: z.union([z.string(), z.date()]),
    maturityDate: z.union([z.string(), z.date()]),
    nominalValue: z.number().optional(),
    couponRateSchedule: z.array(
      z.object({
        yearFrom: z.number(),
        yearTo: z.number(),
        rate: z.number(),
      })
    ).optional(),
    finalPremiumRate: z.number().optional(),
  }).optional(),
  pensionFundDetails: z.object({
    provider: z.string().optional(),
    fundLine: z.string().optional(),
    membershipDate: z.string().optional(),
    expectedRetirementDate: z.string().optional(),
  }).optional(),
  ownershipProfileId: z.string().optional(),
  ownershipProfileName: z.string().optional(),
  ownershipSplits: z.array(
    z.object({
      participantId: z.string(),
      participantName: z.string(),
      percentage: z.number(),
    })
  ).optional(),
}).superRefine((asset, ctx) => {
  if (asset.assetClass !== "cash" && asset.quantity < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quantity"],
      message: "La quantita deve essere non negativa per asset non cash.",
    });
  }
});

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    const { assetId } = await context.params;
    const asset = await getLocalAssetById(user.id, assetId);

    if (!asset) {
      return NextResponse.json({ error: "Asset non trovato." }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    return handleAssetRouteError(error, "Error getting local asset:");
  }
}

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

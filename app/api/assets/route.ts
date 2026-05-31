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
  averageCost: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().optional(),
  totalExpenseRatio: z.number().nonnegative().optional(),
  stampDutyExempt: z.boolean().optional(),
  includeInHistoryTables: z.boolean().optional(),
  currentPrice: z.number().min(0),
  currentPriceEur: z.number().min(0).optional(),
  isLiquid: z.boolean().optional(),
  autoUpdatePrice: z.boolean().optional(),
  composition: z.array(
    z.object({
      assetClass: z.enum([
        "equity",
        "bonds",
        "crypto",
        "realestate",
        "cash",
        "commodity",
      ]),
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

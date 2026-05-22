import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  getLocalBudgetConfig,
  saveLocalBudgetConfig,
} from "@/lib/server/cashflow/localBudgetService";

const ownershipSplitSchema = z.object({
  participantId: z.string().min(1),
  participantName: z.string().min(1),
  percentage: z.number().min(0).max(100),
});

const budgetItemSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(["type", "category", "subcategory"]),
  expenseType: z.enum(["fixed", "variable", "debt"]).optional(),
  categoryId: z.string().min(1).optional(),
  categoryName: z.string().min(1).optional(),
  subCategoryId: z.string().min(1).optional(),
  subCategoryName: z.string().min(1).optional(),
  monthlyAmount: z.number().min(0),
  attributionProfileId: z.string().min(1).optional(),
  attributionProfileName: z.string().min(1).optional(),
  attributionSplits: z.array(ownershipSplitSchema).optional(),
  order: z.number().int().min(0),
});

const budgetConfigSchema = z.object({
  items: z.array(budgetItemSchema),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalBudgetConfig(user.id));
  } catch (error) {
    return handleBudgetRouteError(error, "[LOCAL_BUDGET_GET_ERROR]");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = budgetConfigSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Budget non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await saveLocalBudgetConfig(user.id, parsedBody.data.items)
    );
  } catch (error) {
    return handleBudgetRouteError(error, "[LOCAL_BUDGET_PUT_ERROR]");
  }
}

function handleBudgetRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione budget." },
    { status: 500 }
  );
}

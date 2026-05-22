import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  createLocalExpense,
  listLocalExpenses,
  listLocalExpensesForCostCenter,
} from "@/lib/server/cashflow/localExpenseService";

const dateSchema = z.string().datetime().transform((value) => new Date(value));

const attributionSplitSchema = z.object({
  participantId: z.string().min(1),
  participantName: z.string().min(1),
  percentage: z.number(),
});

const expenseListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
  from: z.string().datetime().transform((value) => new Date(value)).optional(),
  to: z.string().datetime().transform((value) => new Date(value)).optional(),
  type: z.enum(["fixed", "variable", "debt", "income"]).optional(),
  costCenterId: z.string().min(1).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});

export const expenseSchema = z.object({
  type: z.enum(["fixed", "variable", "debt", "income"]),
  categoryId: z.string().min(1),
  categoryName: z.string().trim().min(1),
  subCategoryId: z.string().optional(),
  subCategoryName: z.string().optional(),
  amount: z.number(),
  currency: z.string().trim().min(1),
  date: dateSchema,
  notes: z.string().optional(),
  link: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurringDay: z.number().int().min(1).max(31).optional(),
  recurringParentId: z.string().optional(),
  isInstallment: z.boolean().optional(),
  installmentParentId: z.string().optional(),
  installmentNumber: z.number().int().positive().optional(),
  installmentTotal: z.number().int().positive().optional(),
  installmentTotalAmount: z.number().optional(),
  linkedCashAssetId: z.string().optional(),
  linkedInvestmentAssetId: z.string().optional(),
  linkedInvestmentAssetName: z.string().optional(),
  linkedInvestmentQuantityDelta: z.number().optional(),
  investmentOperationId: z.string().optional(),
  investmentOperationType: z.enum(["buy", "sell"]).optional(),
  investmentOperationPricePerUnit: z.number().optional(),
  investmentOperationFees: z.number().optional(),
  investmentOperationTaxes: z.number().optional(),
  costCenterId: z.string().optional(),
  costCenterName: z.string().optional(),
  attributionProfileId: z.string().optional(),
  attributionProfileName: z.string().optional(),
  attributionSplits: z.array(attributionSplitSchema).optional(),
});

export async function GET(request?: NextRequest) {
  try {
    const user = await requireUserSession();
    const parsedQuery = parseExpenseListQuery(request);

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Filtri movimenti non validi.", issues: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    if (parsedQuery.data.costCenterId) {
      return NextResponse.json(
        await listLocalExpensesForCostCenter(user.id, parsedQuery.data.costCenterId)
      );
    }

    const { costCenterId: _costCenterId, sort: _sort, ...listOptions } = parsedQuery.data;
    return NextResponse.json(await listLocalExpenses(user.id, listOptions));
  } catch (error) {
    return handleExpenseRouteError(error, "[LOCAL_EXPENSES_GET_ERROR]");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = expenseSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Movimento non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await createLocalExpense(user.id, parsedBody.data),
      { status: 201 }
    );
  } catch (error) {
    return handleExpenseRouteError(error, "[LOCAL_EXPENSES_POST_ERROR]");
  }
}

export function handleExpenseRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione movimenti." },
    { status: 500 }
  );
}

function parseExpenseListQuery(request?: NextRequest) {
  if (!request) {
    return expenseListQuerySchema.safeParse({});
  }

  const searchParams = request.nextUrl.searchParams;
  return expenseListQuerySchema.safeParse({
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    costCenterId: searchParams.get("costCenterId") ?? undefined,
    sort: searchParams.get("sort") ?? undefined,
  });
}

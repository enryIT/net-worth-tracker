import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  createLocalInvestmentOperation,
  listLocalInvestmentOperations,
} from "@/lib/server/cashflow/localInvestmentOperationService";

const dateSchema = z.string().datetime().transform((value) => new Date(value));

export const investmentOperationSchema = z.object({
  assetId: z.string().min(1),
  type: z.enum(["buy", "sell", "contribution", "withdrawal", "fee", "tax"]),
  date: dateSchema,
  quantity: z.number().positive(),
  pricePerUnit: z.number().positive(),
  fees: z.number().min(0).optional(),
  taxes: z.number().min(0).optional(),
  currency: z.string().trim().min(1).optional(),
  cashAssetId: z.string().min(1).optional(),
  cashAssetName: z.string().trim().min(1).optional(),
  linkedExpenseId: z.string().min(1).optional(),
  notes: z.string().trim().optional(),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await listLocalInvestmentOperations(user.id));
  } catch (error) {
    return handleInvestmentOperationRouteError(
      error,
      "[LOCAL_INVESTMENT_OPERATIONS_GET_ERROR]"
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = investmentOperationSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Operazione investimento non valida.",
          issues: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await createLocalInvestmentOperation(user.id, parsedBody.data),
      { status: 201 }
    );
  } catch (error) {
    return handleInvestmentOperationRouteError(
      error,
      "[LOCAL_INVESTMENT_OPERATIONS_POST_ERROR]"
    );
  }
}

export function handleInvestmentOperationRouteError(
  error: unknown,
  logMessage: string
) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione operazioni." },
    { status: 500 }
  );
}

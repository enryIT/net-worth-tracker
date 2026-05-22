import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  createLocalInternalTransfer,
  listLocalInternalTransfers,
} from "@/lib/server/cashflow/localInternalTransferService";

const dateSchema = z.string().datetime().transform((value) => new Date(value));

const internalTransferPurposeSchema = z.enum([
  "neutral_transfer",
  "shared_funding",
  "reimbursement",
  "settlement",
  "ownership_adjustment",
]);

export const internalTransferSchema = z.object({
  fromCashAssetId: z.string().min(1),
  toCashAssetId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().trim().min(1).optional(),
  date: dateSchema,
  fees: z.number().min(0).optional(),
  purpose: internalTransferPurposeSchema.optional(),
  notes: z.string().trim().optional(),
  linkedExpenseId: z.string().min(1).optional(),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await listLocalInternalTransfers(user.id));
  } catch (error) {
    return handleInternalTransferRouteError(
      error,
      "[LOCAL_INTERNAL_TRANSFERS_GET_ERROR]"
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = internalTransferSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: "Trasferimento non valido.",
          issues: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await createLocalInternalTransfer(user.id, parsedBody.data),
      { status: 201 }
    );
  } catch (error) {
    return handleInternalTransferRouteError(
      error,
      "[LOCAL_INTERNAL_TRANSFERS_POST_ERROR]"
    );
  }
}

export function handleInternalTransferRouteError(
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
    { error: "Si e verificato un errore durante la gestione trasferimenti." },
    { status: 500 }
  );
}

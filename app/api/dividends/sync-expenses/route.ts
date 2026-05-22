import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { syncLocalDividendExpenses } from "@/lib/server/dividends/localDividendExpenseSyncService";

const legacyDividendSchema = z.object({
  id: z.string().min(1),
}).passthrough();

const syncDividendExpensesSchema = z.object({
  dividends: z.array(legacyDividendSchema).optional(),
  categoryId: z.string().min(1),
  categoryName: z.string().min(1),
  subCategoryId: z.string().min(1).optional(),
  subCategoryName: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = syncDividendExpensesSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Sincronizzazione dividendi non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const result = await syncLocalDividendExpenses(user.id, {
      dividendIds: parsedBody.data.dividends?.map((dividend) => dividend.id),
      categoryId: parsedBody.data.categoryId,
      categoryName: parsedBody.data.categoryName,
      subCategoryId: parsedBody.data.subCategoryId,
      subCategoryName: parsedBody.data.subCategoryName,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return handleDividendExpenseSyncRouteError(error);
  }
}

function handleDividendExpenseSyncRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error("[LOCAL_DIVIDEND_EXPENSE_SYNC_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la sincronizzazione dividendi." },
    { status: 500 }
  );
}

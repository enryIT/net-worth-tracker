import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  createLocalExpenseCategory,
  listLocalExpenseCategories,
} from "@/lib/server/cashflow/localExpenseCategoryService";

const subCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
});

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["fixed", "variable", "debt", "income"]),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional(),
  subCategories: z.array(subCategorySchema).optional(),
  legacyFirebaseId: z.string().trim().min(1).optional(),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await listLocalExpenseCategories(user.id));
  } catch (error) {
    return handleExpenseCategoryRouteError(error, "[LOCAL_EXPENSE_CATEGORIES_GET_ERROR]");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = expenseCategorySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Categoria non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await createLocalExpenseCategory(user.id, parsedBody.data),
      { status: 201 }
    );
  } catch (error) {
    return handleExpenseCategoryRouteError(error, "[LOCAL_EXPENSE_CATEGORIES_POST_ERROR]");
  }
}

export function handleExpenseCategoryRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione categorie." },
    { status: 500 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import {
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalExpenseCategory,
  updateLocalExpenseCategory,
} from "@/lib/server/cashflow/localExpenseCategoryService";
import {
  expenseCategorySchema,
  handleExpenseCategoryRouteError,
} from "@/app/api/expense-categories/route";

type RouteContext = {
  params: Promise<{ categoryId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
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

    const { categoryId } = await context.params;
    const category = await updateLocalExpenseCategory(
      user.id,
      categoryId,
      parsedBody.data
    );

    if (!category) {
      return NextResponse.json({ error: "Categoria non trovata." }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error) {
    return handleExpenseCategoryRouteError(error, "[LOCAL_EXPENSE_CATEGORY_PUT_ERROR]");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const { categoryId } = await context.params;
    const deleted = await deleteLocalExpenseCategory(user.id, categoryId);

    if (!deleted) {
      return NextResponse.json({ error: "Categoria non trovata." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleExpenseCategoryRouteError(error, "[LOCAL_EXPENSE_CATEGORY_DELETE_ERROR]");
  }
}

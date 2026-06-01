import { NextRequest, NextResponse } from "next/server";
import {
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalExpense,
  getLocalExpenseById,
  updateLocalExpense,
} from "@/lib/server/cashflow/localExpenseService";
import {
  expenseSchema,
  handleExpenseRouteError,
} from "@/app/api/expenses/route";

type RouteContext = {
  params: Promise<{ expenseId: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    const { expenseId } = await context.params;
    const expense = await getLocalExpenseById(user.id, expenseId);

    if (!expense) {
      return NextResponse.json({ error: "Movimento non trovato." }, { status: 404 });
    }

    return NextResponse.json(expense);
  } catch (error) {
    return handleExpenseRouteError(error, "[LOCAL_EXPENSE_GET_ERROR]");
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
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

    const { expenseId } = await context.params;
    const expense = await updateLocalExpense(user.id, expenseId, parsedBody.data);

    if (!expense) {
      return NextResponse.json({ error: "Movimento non trovato." }, { status: 404 });
    }

    return NextResponse.json(expense);
  } catch (error) {
    return handleExpenseRouteError(error, "[LOCAL_EXPENSE_PUT_ERROR]");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const { expenseId } = await context.params;
    const deleted = await deleteLocalExpense(user.id, expenseId);

    if (!deleted) {
      return NextResponse.json({ error: "Movimento non trovato." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleExpenseRouteError(error, "[LOCAL_EXPENSE_DELETE_ERROR]");
  }
}

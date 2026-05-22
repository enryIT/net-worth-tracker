import { NextRequest, NextResponse } from "next/server";
import {
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalInvestmentOperation,
  updateLocalInvestmentOperation,
} from "@/lib/server/cashflow/localInvestmentOperationService";
import {
  handleInvestmentOperationRouteError,
  investmentOperationSchema,
} from "@/app/api/investment-operations/route";

type RouteContext = {
  params: Promise<{ operationId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
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

    const { operationId } = await context.params;
    const operation = await updateLocalInvestmentOperation(
      user.id,
      operationId,
      parsedBody.data
    );

    if (!operation) {
      return NextResponse.json(
        { error: "Operazione investimento non trovata." },
        { status: 404 }
      );
    }

    return NextResponse.json(operation);
  } catch (error) {
    return handleInvestmentOperationRouteError(
      error,
      "[LOCAL_INVESTMENT_OPERATION_PUT_ERROR]"
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const { operationId } = await context.params;
    const deleted = await deleteLocalInvestmentOperation(user.id, operationId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Operazione investimento non trovata." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleInvestmentOperationRouteError(
      error,
      "[LOCAL_INVESTMENT_OPERATION_DELETE_ERROR]"
    );
  }
}

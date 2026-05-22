import { NextRequest, NextResponse } from "next/server";
import {
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalInternalTransfer,
  updateLocalInternalTransfer,
} from "@/lib/server/cashflow/localInternalTransferService";
import {
  handleInternalTransferRouteError,
  internalTransferSchema,
} from "@/app/api/internal-transfers/route";

type RouteContext = {
  params: Promise<{ transferId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
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

    const { transferId } = await context.params;
    const transfer = await updateLocalInternalTransfer(
      user.id,
      transferId,
      parsedBody.data
    );

    if (!transfer) {
      return NextResponse.json(
        { error: "Trasferimento non trovato." },
        { status: 404 }
      );
    }

    return NextResponse.json(transfer);
  } catch (error) {
    return handleInternalTransferRouteError(
      error,
      "[LOCAL_INTERNAL_TRANSFER_PUT_ERROR]"
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const { transferId } = await context.params;
    const deleted = await deleteLocalInternalTransfer(user.id, transferId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Trasferimento non trovato." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleInternalTransferRouteError(
      error,
      "[LOCAL_INTERNAL_TRANSFER_DELETE_ERROR]"
    );
  }
}

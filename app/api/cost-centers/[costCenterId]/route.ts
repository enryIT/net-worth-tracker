import { NextRequest, NextResponse } from "next/server";
import {
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalCostCenter,
  updateLocalCostCenter,
} from "@/lib/server/cashflow/localCostCenterService";
import {
  costCenterUpdateSchema,
  handleCostCenterRouteError,
} from "@/app/api/cost-centers/route";

type RouteContext = {
  params: Promise<{ costCenterId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = costCenterUpdateSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Centro di costo non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { costCenterId } = await context.params;
    const { previousName, ...formData } = parsedBody.data;
    const costCenter = await updateLocalCostCenter(
      user.id,
      costCenterId,
      formData,
      previousName
    );

    if (!costCenter) {
      return NextResponse.json(
        { error: "Centro di costo non trovato." },
        { status: 404 }
      );
    }

    return NextResponse.json(costCenter);
  } catch (error) {
    return handleCostCenterRouteError(error, "[LOCAL_COST_CENTER_PUT_ERROR]");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const { costCenterId } = await context.params;
    const deleted = await deleteLocalCostCenter(user.id, costCenterId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Centro di costo non trovato." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleCostCenterRouteError(error, "[LOCAL_COST_CENTER_DELETE_ERROR]");
  }
}

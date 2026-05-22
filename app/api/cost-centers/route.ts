import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  createLocalCostCenter,
  listLocalCostCenters,
} from "@/lib/server/cashflow/localCostCenterService";

export const costCenterSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  color: z.string().trim().optional(),
});

export const costCenterUpdateSchema = costCenterSchema.extend({
  previousName: z.string().trim().optional(),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await listLocalCostCenters(user.id));
  } catch (error) {
    return handleCostCenterRouteError(error, "[LOCAL_COST_CENTERS_GET_ERROR]");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = costCenterSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Centro di costo non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await createLocalCostCenter(user.id, parsedBody.data),
      { status: 201 }
    );
  } catch (error) {
    return handleCostCenterRouteError(error, "[LOCAL_COST_CENTERS_POST_ERROR]");
  }
}

export function handleCostCenterRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione centri di costo." },
    { status: 500 }
  );
}

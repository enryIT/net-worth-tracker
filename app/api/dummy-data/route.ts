import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalDummyCategories,
  deleteLocalDummyData,
  deleteLocalDummyExpenses,
  deleteLocalDummySnapshots,
  getLocalDummyDataCount,
} from "@/lib/server/dummy/localDummyDataService";

const deleteTargetSchema = z.enum([
  "snapshots",
  "expenses",
  "categories",
  "all",
]);

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalDummyDataCount(user.id));
  } catch (error) {
    return handleDummyDataRouteError(error, "[LOCAL_DUMMY_DATA_GET_ERROR]");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const targetParam = request.nextUrl.searchParams.get("target");
    const parsedTarget = deleteTargetSchema.safeParse(targetParam ?? "all");

    if (!parsedTarget.success) {
      return NextResponse.json(
        { error: "Target eliminazione dati dummy non valido." },
        { status: 400 }
      );
    }

    if (parsedTarget.data === "all") {
      return NextResponse.json(await deleteLocalDummyData(user.id));
    }

    if (parsedTarget.data === "snapshots") {
      const snapshots = await deleteLocalDummySnapshots(user.id);
      return NextResponse.json({
        snapshots,
        expenses: 0,
        categories: 0,
        total: snapshots,
      });
    }

    if (parsedTarget.data === "expenses") {
      const expenses = await deleteLocalDummyExpenses(user.id);
      return NextResponse.json({
        snapshots: 0,
        expenses,
        categories: 0,
        total: expenses,
      });
    }

    const categories = await deleteLocalDummyCategories(user.id);
    return NextResponse.json({
      snapshots: 0,
      expenses: 0,
      categories,
      total: categories,
    });
  } catch (error) {
    return handleDummyDataRouteError(error, "[LOCAL_DUMMY_DATA_DELETE_ERROR]");
  }
}

function handleDummyDataRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione dati dummy." },
    { status: 500 }
  );
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  assertWritableUser,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  clearLocalExpensesCategoryAssignment,
  countLocalExpensesByCategory,
  countLocalExpensesBySubCategory,
  moveLocalExpensesFromSubCategory,
  moveLocalExpensesToCategory,
  reassignLocalExpensesCategory,
  reassignLocalExpensesSubCategory,
} from "@/lib/server/cashflow/localExpenseService";

const expenseTypeSchema = z.enum(["fixed", "variable", "debt", "income"]);

const categoryAssignmentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("countByCategory"),
    categoryId: z.string().min(1),
  }),
  z.object({
    action: z.literal("countBySubCategory"),
    categoryId: z.string().min(1),
    subCategoryId: z.string().min(1),
  }),
  z.object({
    action: z.literal("reassignCategory"),
    oldCategoryId: z.string().min(1),
    newCategoryId: z.string().min(1),
    newCategoryName: z.string().trim().min(1),
    newSubCategoryId: z.string().min(1).optional(),
    newSubCategoryName: z.string().trim().min(1).optional(),
  }),
  z.object({
    action: z.literal("clearCategory"),
    categoryId: z.string().min(1),
  }),
  z.object({
    action: z.literal("reassignSubCategory"),
    categoryId: z.string().min(1),
    oldSubCategoryId: z.string().min(1),
    newSubCategoryId: z.string().min(1).optional(),
    newSubCategoryName: z.string().trim().min(1).optional(),
  }),
  z.object({
    action: z.literal("moveCategory"),
    oldCategoryId: z.string().min(1),
    oldType: expenseTypeSchema,
    newCategoryId: z.string().min(1),
    newCategoryName: z.string().trim().min(1),
    newType: expenseTypeSchema,
    newSubCategoryId: z.string().min(1).optional(),
    newSubCategoryName: z.string().trim().min(1).optional(),
  }),
  z.object({
    action: z.literal("moveSubCategory"),
    oldCategoryId: z.string().min(1),
    oldSubCategoryId: z.string().min(1),
    oldType: expenseTypeSchema,
    newCategoryId: z.string().min(1),
    newCategoryName: z.string().trim().min(1),
    newType: expenseTypeSchema,
    newSubCategoryId: z.string().min(1).optional(),
    newSubCategoryName: z.string().trim().min(1).optional(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const body: unknown = await request.json();
    const parsedBody = categoryAssignmentActionSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Operazione categoria movimenti non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const action = parsedBody.data;

    switch (action.action) {
      case "countByCategory":
        return NextResponse.json({
          count: await countLocalExpensesByCategory(user.id, action.categoryId),
        });
      case "countBySubCategory":
        return NextResponse.json({
          count: await countLocalExpensesBySubCategory(
            user.id,
            action.categoryId,
            action.subCategoryId
          ),
        });
      case "reassignCategory":
        assertWritableUser(user);
        return NextResponse.json({
          count: await reassignLocalExpensesCategory(user.id, {
            oldCategoryId: action.oldCategoryId,
            newCategoryId: action.newCategoryId,
            newCategoryName: action.newCategoryName,
            newSubCategoryId: action.newSubCategoryId,
            newSubCategoryName: action.newSubCategoryName,
          }),
        });
      case "clearCategory":
        assertWritableUser(user);
        return NextResponse.json({
          count: await clearLocalExpensesCategoryAssignment(user.id, action.categoryId),
        });
      case "reassignSubCategory":
        assertWritableUser(user);
        return NextResponse.json({
          count: await reassignLocalExpensesSubCategory(user.id, {
            categoryId: action.categoryId,
            oldSubCategoryId: action.oldSubCategoryId,
            newSubCategoryId: action.newSubCategoryId,
            newSubCategoryName: action.newSubCategoryName,
          }),
        });
      case "moveCategory":
        assertWritableUser(user);
        return NextResponse.json({
          count: await moveLocalExpensesToCategory(user.id, {
            oldCategoryId: action.oldCategoryId,
            oldType: action.oldType,
            newCategoryId: action.newCategoryId,
            newCategoryName: action.newCategoryName,
            newType: action.newType,
            newSubCategoryId: action.newSubCategoryId,
            newSubCategoryName: action.newSubCategoryName,
          }),
        });
      case "moveSubCategory":
        assertWritableUser(user);
        return NextResponse.json({
          count: await moveLocalExpensesFromSubCategory(user.id, {
            oldCategoryId: action.oldCategoryId,
            oldSubCategoryId: action.oldSubCategoryId,
            oldType: action.oldType,
            newCategoryId: action.newCategoryId,
            newCategoryName: action.newCategoryName,
            newType: action.newType,
            newSubCategoryId: action.newSubCategoryId,
            newSubCategoryName: action.newSubCategoryName,
          }),
        });
    }
  } catch (error) {
    return handleCategoryAssignmentRouteError(error);
  }
}

function handleCategoryAssignmentRouteError(error: unknown) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error("[LOCAL_EXPENSE_CATEGORY_ASSIGNMENT_POST_ERROR]", error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la gestione categorie movimenti." },
    { status: 500 }
  );
}

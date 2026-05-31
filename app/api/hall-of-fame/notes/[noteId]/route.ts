import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalHallOfFameNote,
  updateLocalHallOfFameNote,
} from "@/lib/server/hall-of-fame/localHallOfFameService";

const hallOfFameSectionSchema = z.enum([
  "bestMonthsByNetWorthGrowth",
  "bestMonthsByIncome",
  "worstMonthsByNetWorthDecline",
  "worstMonthsByExpenses",
  "bestYearsByNetWorthGrowth",
  "bestYearsByIncome",
  "worstYearsByNetWorthDecline",
  "worstYearsByExpenses",
]);

const updateHallOfFameNoteSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  sections: z.array(hallOfFameSectionSchema).min(1).optional(),
}).refine((data) => data.text !== undefined || data.sections !== undefined, {
  message: "Almeno un campo da aggiornare è richiesto.",
});

type RouteContext = {
  params: Promise<{ noteId: string }>;
};

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = updateHallOfFameNoteSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Aggiornamento nota non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const { noteId } = await context.params;
    await updateLocalHallOfFameNote(user.id, noteId, parsedBody.data);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleHallOfFameNoteItemRouteError(error, "[LOCAL_HALL_OF_FAME_NOTES_PUT_ERROR]");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const { noteId } = await context.params;
    await deleteLocalHallOfFameNote(user.id, noteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleHallOfFameNoteItemRouteError(error, "[LOCAL_HALL_OF_FAME_NOTES_DELETE_ERROR]");
  }
}

function handleHallOfFameNoteItemRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  if (
    error instanceof Error &&
    (error.message === "Hall of Fame data not found" || error.message === "Note not found")
  ) {
    return NextResponse.json(
      { error: "Nota Hall of Fame non trovata." },
      { status: 404 }
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Si è verificato un errore durante la gestione della nota." },
    { status: 500 }
  );
}

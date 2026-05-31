import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { addLocalHallOfFameNote } from "@/lib/server/hall-of-fame/localHallOfFameService";

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

const createHallOfFameNoteSchema = z.object({
  text: z.string().trim().min(1).max(500),
  sections: z.array(hallOfFameSectionSchema).min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = createHallOfFameNoteSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Nota Hall of Fame non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const note = await addLocalHallOfFameNote(user.id, parsedBody.data);

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    if (
      error instanceof Error &&
      error.message === "Hall of Fame data not found. Create a snapshot first."
    ) {
      return NextResponse.json(
        { error: "Hall of Fame non trovata. Crea prima uno snapshot." },
        { status: 404 }
      );
    }

    console.error("[LOCAL_HALL_OF_FAME_NOTES_POST_ERROR]", error);
    return NextResponse.json(
      { error: "Si è verificato un errore durante il salvataggio della nota." },
      { status: 500 }
    );
  }
}

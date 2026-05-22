import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  getLocalGoalData,
  saveLocalGoalData,
} from "@/lib/server/goals/localGoalDataService";
import type { GoalBasedInvestingData } from "@/types/goals";

const goalPrioritySchema = z.enum(["alta", "media", "bassa"]);

const investmentGoalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetAmount: z.number().optional(),
  targetDate: z.string().optional(),
  priority: goalPrioritySchema,
  color: z.string().min(1),
  recommendedAllocation: z.record(z.string(), z.number()).optional(),
  notes: z.string().optional(),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

const goalAssetAssignmentSchema = z.object({
  goalId: z.string().min(1),
  assetId: z.string().min(1),
  percentage: z.number().min(0).max(100),
});

const goalDataSchema = z.object({
  goals: z.array(investmentGoalSchema),
  assignments: z.array(goalAssetAssignmentSchema),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalGoalData(user.id));
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[GOALS_GET_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il caricamento obiettivi." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = goalDataSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Dati obiettivi non validi." },
        { status: 400 }
      );
    }

    await saveLocalGoalData(user.id, parsedBody.data as GoalBasedInvestingData);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[GOALS_PUT_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante il salvataggio obiettivi." },
      { status: 500 }
    );
  }
}

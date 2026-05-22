import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  createLocalAssistantThread,
  isAssistantStoreError,
  listLocalAssistantThreads,
} from "@/lib/server/assistant/localAssistantThreadService";

const assistantModeSchema = z.enum([
  "month_analysis",
  "year_analysis",
  "ytd_analysis",
  "history_analysis",
  "quarter_analysis",
  "chat",
]);

const monthSelectorSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(-2).max(12),
});

const createThreadSchema = z.object({
  mode: assistantModeSchema.default("chat"),
  pinnedMonth: monthSelectorSchema.nullish(),
  pinnedYear: z.number().int().nullable().optional(),
});

export async function GET(_request: NextRequest) {
  try {
    const user = await requireUserSession();
    const threads = await listLocalAssistantThreads(user.id);
    return NextResponse.json({ threads });
  } catch (error) {
    return handleThreadRouteError(error, "[LOCAL_ASSISTANT_THREADS_GET_ERROR]");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const body: unknown = await request.json();
    const parsedBody = createThreadSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Thread assistente non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const thread = await createLocalAssistantThread({
      userId: user.id,
      mode: parsedBody.data.mode,
      pinnedMonth: parsedBody.data.pinnedMonth ?? null,
      pinnedYear: parsedBody.data.pinnedYear ?? null,
    });

    return NextResponse.json({ thread });
  } catch (error) {
    return handleThreadRouteError(error, "[LOCAL_ASSISTANT_THREADS_POST_ERROR]");
  }
}

function handleThreadRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  if (isAssistantStoreError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Impossibile gestire i thread dell'assistente" },
    { status: 500 }
  );
}

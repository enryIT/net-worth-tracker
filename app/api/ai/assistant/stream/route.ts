import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import { streamAssistantResponse } from "@/lib/server/assistant/anthropicStream";
import {
  appendLocalAssistantMessage,
  buildLocalThreadTitleFromPrompt,
  createLocalAssistantThread,
  getLocalAssistantThread,
  getLocalAssistantThreadDetail,
  isAssistantStoreError,
  updateLocalAssistantThreadMetadata,
} from "@/lib/server/assistant/localAssistantThreadService";
import {
  getDefaultAssistantPreferences,
  resolveAssistantWebSearchPolicy,
} from "@/lib/server/assistant/webSearchPolicy";
import { getLocalAssistantMemoryDocument } from "@/lib/server/assistant/localAssistantMemoryService";
import { extractAndSaveLocalAssistantMemory } from "@/lib/server/assistant/localAssistantMemoryExtractionService";
import {
  buildAssistantHistoryContext,
  buildAssistantMonthContext,
  buildAssistantQuarterContext,
  buildAssistantYearContext,
  buildAssistantYtdContext,
} from "@/lib/services/assistantMonthContextService";
import { getLocalSettings } from "@/lib/server/settings/localSettingsService";
import type {
  AssistantMonthContextBundle,
  AssistantStreamEvent,
} from "@/types/assistant";
import type { HouseholdFilterScope } from "@/lib/utils/householdUtils";

type ContextOptions = {
  householdScope?: HouseholdFilterScope;
};

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
  quarter: z.number().int().min(1).max(4).optional(),
});

const preferencesSchema = z.object({
  responseStyle: z.enum(["balanced", "concise", "deep"]).optional(),
  includeMacroContext: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  includeDummySnapshots: z.boolean().optional(),
  householdScopeLabel: z.string().optional(),
});

const assistantStreamRequestSchema = z.object({
  mode: assistantModeSchema,
  prompt: z.string().trim().min(1),
  threadId: z.string().optional(),
  month: monthSelectorSchema.optional(),
  year: z.number().int().optional(),
  chatContext: z.enum(["none", "month", "year", "ytd", "history"]).optional(),
  preferences: preferencesSchema.optional(),
  householdScope: z.unknown().optional(),
  householdScopeLabel: z.string().optional(),
});

function encodeAssistantEvent(event: AssistantStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: "Servizio AI non configurato. Aggiungi ANTHROPIC_API_KEY per abilitare l'assistente.",
        },
        { status: 500 }
      );
    }

    const rawBody: unknown = await request.json();
    const parsedBody = assistantStreamRequestSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Parametri assistente non validi.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsedBody.data;
    const input = body;
    const memoryDocument = await getLocalAssistantMemoryDocument(user.id).catch(
      () => null
    );
    const preferences = {
      ...getDefaultAssistantPreferences(),
      ...(memoryDocument?.preferences ?? {}),
      ...input.preferences,
      householdScopeLabel:
        input.householdScopeLabel ??
        input.preferences?.householdScopeLabel ??
        memoryDocument?.preferences.householdScopeLabel,
    };
    const enableWebSearch = resolveAssistantWebSearchPolicy(
      input.mode,
      input.prompt,
      preferences
    );
    const includeDummy = preferences.includeDummySnapshots ?? false;
    const activeMemoryItems = (memoryDocument?.items ?? []).filter(
      (item) => item.status === "active"
    );
    const contextOptions = {
      householdScope: body.householdScope as HouseholdFilterScope | undefined,
    };

    const contextBundle = await buildContextBundle(
      user.id,
      input,
      includeDummy,
      contextOptions
    );

    const existingThread = input.threadId
      ? await getLocalAssistantThread(input.threadId, user.id)
      : null;
    const conversationHistory = existingThread
      ? (await getLocalAssistantThreadDetail(existingThread.id, user.id)).messages
      : [];
    const thread =
      existingThread ??
      (await createLocalAssistantThread({
        userId: user.id,
        mode: input.mode,
        pinnedMonth: input.month ?? null,
        pinnedYear: input.year ?? null,
        title: buildLocalThreadTitleFromPrompt(input.prompt, input.mode),
      }));

    const userMessage = await appendLocalAssistantMessage(thread.id, {
      userId: user.id,
      role: "user",
      content: input.prompt,
      mode: input.mode,
      monthContext: input.month ?? null,
      webSearchUsed: false,
    });

    const stream = new ReadableStream({
      async start(controller) {
        let assistantText = "";

        try {
          controller.enqueue(
            encodeAssistantEvent({
              type: "meta",
              threadId: thread.id,
              title: existingThread?.title ?? thread.title,
            })
          );

          if (contextBundle) {
            controller.enqueue(
              encodeAssistantEvent({
                type: "context",
                bundle: contextBundle,
              })
            );
          }

          const result = await streamAssistantResponse({
            mode: input.mode,
            prompt: input.prompt,
            contextBundle,
            month: input.month ?? null,
            preferences,
            memoryItems: activeMemoryItems,
            enableWebSearch,
            conversationHistory,
            onStatus: (status) => {
              controller.enqueue(encodeAssistantEvent({ type: "status", status }));
            },
            onText: (text) => {
              assistantText += text;
              controller.enqueue(encodeAssistantEvent({ type: "text", text }));
            },
          });

          const assistantMessage = await appendLocalAssistantMessage(thread.id, {
            userId: user.id,
            role: "assistant",
            content: result.text,
            mode: input.mode,
            monthContext: input.month ?? null,
            webSearchUsed: result.webSearchUsed,
          });

          extractAndSaveLocalAssistantMemory({
            userId: user.id,
            threadId: thread.id,
            messageId: assistantMessage.id,
            userMessage: input.prompt,
            assistantMessage: result.text,
            memoryDocument,
          }).catch((error) => {
            console.error("[LOCAL_ASSISTANT_MEMORY_EXTRACTION_UNCAUGHT]", error);
          });

          await updateLocalAssistantThreadMetadata(thread.id, user.id, {
            title: existingThread?.lastMessagePreview
              ? existingThread.title
              : buildLocalThreadTitleFromPrompt(input.prompt, input.mode),
            lastMessagePreview: assistantText || userMessage.content,
            mode: input.mode,
            pinnedMonth: input.month ?? existingThread?.pinnedMonth ?? null,
            pinnedYear: input.year ?? existingThread?.pinnedYear ?? null,
          });

          controller.enqueue(
            encodeAssistantEvent({
              type: "done",
              threadId: thread.id,
              messageId: assistantMessage.id,
              webSearchUsed: result.webSearchUsed,
            })
          );
          controller.close();
        } catch (error) {
          const retryable = isRetryableAssistantError(error);
          controller.enqueue(
            encodeAssistantEvent({
              type: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "Errore durante la generazione della risposta dell'assistente",
              retryable,
            })
          );
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[LOCAL_ASSISTANT_STREAM_ROUTE_ERROR]", error);
    return NextResponse.json(
      { error: "Impossibile avviare lo stream dell'assistente" },
      { status: 500 }
    );
  }
}

async function buildContextBundle(
  userId: string,
  input: z.infer<typeof assistantStreamRequestSchema>,
  includeDummy: boolean,
  contextOptions: ContextOptions
): Promise<AssistantMonthContextBundle | null> {
  if (input.mode === "year_analysis" && input.year) {
    return buildAssistantYearContext(userId, input.year, includeDummy, contextOptions);
  }

  if (input.mode === "ytd_analysis") {
    return buildAssistantYtdContext(userId, includeDummy, contextOptions);
  }

  if (input.mode === "history_analysis") {
    return buildAssistantHistoryContext(
      userId,
      await fetchHistoryStartYear(userId),
      includeDummy,
      contextOptions
    );
  }

  if (input.mode === "quarter_analysis" && input.month?.quarter) {
    return buildAssistantQuarterContext(
      userId,
      input.month.year,
      input.month.quarter,
      includeDummy
    );
  }

  if (input.mode === "chat") {
    if (input.chatContext === "year" && input.year) {
      return buildAssistantYearContext(userId, input.year, includeDummy, contextOptions);
    }

    if (input.chatContext === "ytd") {
      return buildAssistantYtdContext(userId, includeDummy, contextOptions);
    }

    if (input.chatContext === "history") {
      return buildAssistantHistoryContext(
        userId,
        await fetchHistoryStartYear(userId),
        includeDummy,
        contextOptions
      );
    }

    if (input.chatContext === "month" && input.month) {
      return buildAssistantMonthContext(userId, input.month, includeDummy, contextOptions);
    }

    if (!input.chatContext && input.month) {
      return buildAssistantMonthContext(userId, input.month, includeDummy, contextOptions);
    }

    return null;
  }

  if (input.month) {
    return buildAssistantMonthContext(userId, input.month, includeDummy, contextOptions);
  }

  return null;
}

async function fetchHistoryStartYear(userId: string): Promise<number> {
  const settings = await getLocalSettings(userId);
  return settings?.cashflowHistoryStartYear ?? new Date().getFullYear() - 5;
}

function isRetryableAssistantError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    Boolean(error.retryable)
  );
}

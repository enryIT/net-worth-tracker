import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalAssistantMemoryDocument,
  getLocalAssistantMemoryDocument,
  isAssistantStoreError,
  setLocalAssistantGoalEvaluation,
  updateLocalAssistantMemoryDocument,
} from "@/lib/server/assistant/localAssistantMemoryService";
import type {
  AssistantGoalEvaluationResult,
  AssistantStructuredGoal,
} from "@/types/assistant";

const assistantPreferencesSchema = z.object({
  responseStyle: z.enum(["balanced", "concise", "deep"]).optional(),
  includeMacroContext: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  includeDummySnapshots: z.boolean().optional(),
  householdScopeLabel: z.string().optional(),
});

const memoryItemSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["goal", "preference", "risk", "fact"]),
  text: z.string().min(1),
  structuredGoal: z.custom<AssistantStructuredGoal>().optional(),
  sourceThreadId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
  completedAt: z.coerce.date().optional(),
  derivedFromContext: z.boolean().optional(),
  evidenceSummary: z.string().optional(),
  lastEvaluationAt: z.coerce.date().optional(),
  lastEvaluationResult: z.custom<AssistantGoalEvaluationResult>().optional(),
});

const suggestionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  type: z.literal("complete_goal"),
  status: z.enum(["pending", "ignored", "accepted"]),
  evidenceSummary: z.string().min(1),
  evaluation: z.custom<AssistantGoalEvaluationResult>(),
});

const patchMemorySchema = z.object({
  preferences: assistantPreferencesSchema.optional(),
  item: memoryItemSchema.optional(),
  suggestion: suggestionSchema.optional(),
  action: z.enum(["acceptSuggestion", "ignoreSuggestion", "reactivateGoal"]).optional(),
  suggestionId: z.string().optional(),
  itemId: z.string().optional(),
});

const deleteMemorySchema = z.object({
  itemId: z.string().optional(),
  resetAll: z.boolean().optional(),
});

export async function GET(_request: NextRequest) {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalAssistantMemoryDocument(user.id));
  } catch (error) {
    return handleMemoryRouteError(error, "[LOCAL_ASSISTANT_MEMORY_GET_ERROR]");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const body: unknown = await request.json();
    const parsedBody = patchMemorySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Memoria assistente non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const input = parsedBody.data;
    let memory;

    if (input.action === "acceptSuggestion") {
      if (!input.suggestionId || !input.itemId) {
        return NextResponse.json(
          { error: "suggestionId e itemId sono obbligatori" },
          { status: 400 }
        );
      }

      const current = await getLocalAssistantMemoryDocument(user.id);
      const suggestion = current.suggestions.find(
        (entry) => entry.id === input.suggestionId
      );
      const item = current.items.find((entry) => entry.id === input.itemId);

      if (!suggestion || !item) {
        return NextResponse.json(
          { error: "Suggerimento o obiettivo non trovato" },
          { status: 404 }
        );
      }

      await setLocalAssistantGoalEvaluation(user.id, item.id, suggestion.evaluation);
      await updateLocalAssistantMemoryDocument(user.id, {
        item: {
          ...item,
          status: "completed",
          completedAt: new Date(),
          evidenceSummary: suggestion.evidenceSummary,
          derivedFromContext: true,
        },
      });
      memory = await updateLocalAssistantMemoryDocument(user.id, {
        suggestion: {
          ...suggestion,
          status: "accepted",
        },
      });
    } else if (input.action === "ignoreSuggestion") {
      if (!input.suggestionId) {
        return NextResponse.json(
          { error: "suggestionId obbligatorio" },
          { status: 400 }
        );
      }

      const current = await getLocalAssistantMemoryDocument(user.id);
      const suggestion = current.suggestions.find(
        (entry) => entry.id === input.suggestionId
      );
      if (!suggestion) {
        return NextResponse.json(
          { error: "Suggerimento non trovato" },
          { status: 404 }
        );
      }

      memory = await updateLocalAssistantMemoryDocument(user.id, {
        suggestion: {
          ...suggestion,
          status: "ignored",
        },
      });
    } else if (input.action === "reactivateGoal") {
      if (!input.itemId) {
        return NextResponse.json({ error: "itemId obbligatorio" }, { status: 400 });
      }

      const current = await getLocalAssistantMemoryDocument(user.id);
      const item = current.items.find((entry) => entry.id === input.itemId);
      if (!item) {
        return NextResponse.json(
          { error: "Obiettivo non trovato" },
          { status: 404 }
        );
      }

      memory = await updateLocalAssistantMemoryDocument(user.id, {
        item: {
          ...item,
          status: "active",
          completedAt: undefined,
        },
      });
    } else {
      memory = await updateLocalAssistantMemoryDocument(user.id, {
        preferences: input.preferences,
        item: input.item,
        suggestion: input.suggestion,
      });
    }

    return NextResponse.json(memory);
  } catch (error) {
    return handleMemoryRouteError(error, "[LOCAL_ASSISTANT_MEMORY_PATCH_ERROR]");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const body: unknown = await request.json();
    const parsedBody = deleteMemorySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Richiesta eliminazione memoria non valida.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await deleteLocalAssistantMemoryDocument(user.id, {
        itemId: parsedBody.data.itemId,
        resetAll: parsedBody.data.resetAll,
      })
    );
  } catch (error) {
    return handleMemoryRouteError(error, "[LOCAL_ASSISTANT_MEMORY_DELETE_ERROR]");
  }
}

function handleMemoryRouteError(error: unknown, logMessage: string) {
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
    { error: "Impossibile gestire la memoria dell'assistente" },
    { status: 500 }
  );
}

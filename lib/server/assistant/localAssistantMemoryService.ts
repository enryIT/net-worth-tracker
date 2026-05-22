import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  getDefaultAssistantPreferences,
} from "@/lib/server/assistant/webSearchPolicy";
import { parseStructuredGoalFromText } from "@/lib/server/assistant/goalEvaluation";
import type {
  AssistantGoalEvaluationResult,
  AssistantMemoryDocument,
  AssistantMemoryItem,
  AssistantMemorySuggestion,
  AssistantPreferences,
} from "@/types/assistant";
import { AssistantStoreError } from "@/lib/server/assistant/localAssistantThreadService";

type MemoryItemRow = {
  id: string;
  userId: string;
  category: string;
  text: string;
  structuredGoal: Prisma.JsonValue | null;
  sourceThreadId: string | null;
  sourceMessageId: string | null;
  status: string;
  completedAt: Date | null;
  derivedFromContext: boolean | null;
  evidenceSummary: string | null;
  lastEvaluationAt: Date | null;
  lastEvaluationResult: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

type MemorySuggestionRow = {
  id: string;
  userId: string;
  itemId: string;
  type: string;
  status: string;
  evidenceSummary: string;
  evaluation: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export function isAssistantStoreError(error: unknown): error is AssistantStoreError {
  return error instanceof AssistantStoreError;
}

export async function getLocalAssistantMemoryDocument(
  userId: string
): Promise<AssistantMemoryDocument> {
  const [settings, items, suggestions, dummyCount] = await Promise.all([
    prisma.userSetting.findUnique({ where: { userId } }),
    prisma.assistantMemoryItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.assistantMemorySuggestion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.monthlySnapshot.count({
      where: { userId, isDummy: true },
      take: 1,
    }),
  ]);

  return {
    preferences: resolvePreferences(settings?.data),
    items: items.map(mapMemoryItemRow),
    suggestions: suggestions.map(mapMemorySuggestionRow),
    updatedAt: getLatestUpdatedAt(items, suggestions),
    hasDummySnapshots: dummyCount > 0,
  };
}

export async function updateLocalAssistantMemoryDocument(
  userId: string,
  updates: {
    preferences?: Partial<AssistantPreferences>;
    item?: Partial<AssistantMemoryItem> & Pick<AssistantMemoryItem, "id" | "text" | "category">;
    suggestion?: Partial<AssistantMemorySuggestion> & Pick<AssistantMemorySuggestion, "id" | "itemId" | "type" | "status" | "evidenceSummary" | "evaluation">;
  }
): Promise<AssistantMemoryDocument> {
  if (updates.preferences) {
    await upsertAssistantPreferences(userId, updates.preferences);
  }

  if (updates.item) {
    await upsertMemoryItem(userId, updates.item);
  }

  if (updates.suggestion) {
    await upsertMemorySuggestion(userId, updates.suggestion);
  }

  return getLocalAssistantMemoryDocument(userId);
}

export async function deleteLocalAssistantMemoryDocument(
  userId: string,
  options: { itemId?: string; resetAll?: boolean }
): Promise<AssistantMemoryDocument> {
  if (options.resetAll) {
    await prisma.$transaction([
      prisma.assistantMemorySuggestion.deleteMany({ where: { userId } }),
      prisma.assistantMemoryItem.deleteMany({ where: { userId } }),
    ]);
    return getLocalAssistantMemoryDocument(userId);
  }

  if (!options.itemId) {
    throw new AssistantStoreError(400, "itemId o resetAll sono obbligatori");
  }

  await prisma.$transaction([
    prisma.assistantMemorySuggestion.deleteMany({
      where: { userId, itemId: options.itemId },
    }),
    prisma.assistantMemoryItem.deleteMany({
      where: { userId, id: options.itemId },
    }),
  ]);

  return getLocalAssistantMemoryDocument(userId);
}

export async function setLocalAssistantGoalEvaluation(
  userId: string,
  itemId: string,
  evaluation: AssistantGoalEvaluationResult
): Promise<AssistantMemoryDocument> {
  const current = await getLocalAssistantMemoryDocument(userId);
  const item = current.items.find((entry) => entry.id === itemId);

  if (!item) {
    throw new AssistantStoreError(404, "Obiettivo memoria non trovato");
  }

  return updateLocalAssistantMemoryDocument(userId, {
    item: {
      ...item,
      lastEvaluationAt: new Date(),
      lastEvaluationResult: evaluation,
    },
  });
}

async function upsertAssistantPreferences(
  userId: string,
  preferences: Partial<AssistantPreferences>
): Promise<void> {
  const existing = await prisma.userSetting.findUnique({ where: { userId } });
  const existingData = isRecord(existing?.data) ? existing.data : {};
  const merged = {
    ...existingData,
    ...serializePreferences(preferences),
  };

  await prisma.userSetting.upsert({
    where: { userId },
    create: {
      userId,
      data: merged as Prisma.InputJsonValue,
    },
    update: {
      data: merged as Prisma.InputJsonValue,
    },
  });
}

async function upsertMemoryItem(
  userId: string,
  item: Partial<AssistantMemoryItem> & Pick<AssistantMemoryItem, "id" | "text" | "category">
): Promise<void> {
  const structuredGoal =
    item.category === "goal"
      ? item.structuredGoal ?? parseStructuredGoalFromText(item.text)
      : undefined;

  await prisma.assistantMemoryItem.upsert({
    where: {
      id_userId: {
        id: item.id,
        userId,
      },
    },
    create: {
      id: item.id,
      userId,
      category: item.category,
      text: item.text,
      structuredGoal: (structuredGoal ?? undefined) as unknown as Prisma.InputJsonValue,
      sourceThreadId: item.sourceThreadId,
      sourceMessageId: item.sourceMessageId,
      status: item.status ?? "active",
      completedAt: item.completedAt,
      derivedFromContext: item.derivedFromContext,
      evidenceSummary: item.evidenceSummary,
      lastEvaluationAt: item.lastEvaluationAt,
      lastEvaluationResult: item.lastEvaluationResult as unknown as Prisma.InputJsonValue,
    },
    update: {
      category: item.category,
      text: item.text,
      structuredGoal: (structuredGoal ?? undefined) as unknown as Prisma.InputJsonValue,
      sourceThreadId: item.sourceThreadId,
      sourceMessageId: item.sourceMessageId,
      status: item.status ?? "active",
      completedAt: item.completedAt,
      derivedFromContext: item.derivedFromContext,
      evidenceSummary: item.evidenceSummary,
      lastEvaluationAt: item.lastEvaluationAt,
      lastEvaluationResult: item.lastEvaluationResult as unknown as Prisma.InputJsonValue,
    },
  });
}

async function upsertMemorySuggestion(
  userId: string,
  suggestion: Partial<AssistantMemorySuggestion> & Pick<AssistantMemorySuggestion, "id" | "itemId" | "type" | "status" | "evidenceSummary" | "evaluation">
): Promise<void> {
  await prisma.assistantMemorySuggestion.upsert({
    where: {
      id_userId: {
        id: suggestion.id,
        userId,
      },
    },
    create: {
      id: suggestion.id,
      userId,
      itemId: suggestion.itemId,
      type: suggestion.type,
      status: suggestion.status,
      evidenceSummary: suggestion.evidenceSummary,
      evaluation: suggestion.evaluation as unknown as Prisma.InputJsonValue,
    },
    update: {
      itemId: suggestion.itemId,
      type: suggestion.type,
      status: suggestion.status,
      evidenceSummary: suggestion.evidenceSummary,
      evaluation: suggestion.evaluation as unknown as Prisma.InputJsonValue,
    },
  });
}

function resolvePreferences(input: unknown): AssistantPreferences {
  const defaults = getDefaultAssistantPreferences();
  const data = isRecord(input) ? input : {};

  return {
    responseStyle: isResponseStyle(data.assistantResponseStyle)
      ? data.assistantResponseStyle
      : defaults.responseStyle,
    includeMacroContext:
      typeof data.assistantMacroContextEnabled === "boolean"
        ? data.assistantMacroContextEnabled
        : defaults.includeMacroContext,
    memoryEnabled:
      typeof data.assistantMemoryEnabled === "boolean"
        ? data.assistantMemoryEnabled
        : defaults.memoryEnabled,
    includeDummySnapshots:
      typeof data.assistantIncludeDummySnapshots === "boolean"
        ? data.assistantIncludeDummySnapshots
        : defaults.includeDummySnapshots,
  };
}

function serializePreferences(
  preferences: Partial<AssistantPreferences>
): Record<string, unknown> {
  return stripUndefined({
    assistantResponseStyle: preferences.responseStyle,
    assistantMacroContextEnabled: preferences.includeMacroContext,
    assistantMemoryEnabled: preferences.memoryEnabled,
    assistantIncludeDummySnapshots: preferences.includeDummySnapshots,
  });
}

function mapMemoryItemRow(row: MemoryItemRow): AssistantMemoryItem {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category as AssistantMemoryItem["category"],
    text: row.text,
    structuredGoal: row.structuredGoal as unknown as AssistantMemoryItem["structuredGoal"],
    sourceThreadId: row.sourceThreadId ?? undefined,
    sourceMessageId: row.sourceMessageId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? undefined,
    derivedFromContext: row.derivedFromContext ?? undefined,
    evidenceSummary: row.evidenceSummary ?? undefined,
    lastEvaluationAt: row.lastEvaluationAt ?? undefined,
    lastEvaluationResult: row.lastEvaluationResult as unknown as AssistantMemoryItem["lastEvaluationResult"],
    status: row.status as AssistantMemoryItem["status"],
  };
}

function mapMemorySuggestionRow(row: MemorySuggestionRow): AssistantMemorySuggestion {
  return {
    id: row.id,
    userId: row.userId,
    itemId: row.itemId,
    type: row.type as AssistantMemorySuggestion["type"],
    status: row.status as AssistantMemorySuggestion["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    evidenceSummary: row.evidenceSummary,
    evaluation: row.evaluation as unknown as AssistantMemorySuggestion["evaluation"],
  };
}

function getLatestUpdatedAt(
  items: MemoryItemRow[],
  suggestions: MemorySuggestionRow[]
): Date | null {
  const dates = [...items, ...suggestions].map((entry) => entry.updatedAt.getTime());
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates));
}

function isResponseStyle(input: unknown): input is AssistantPreferences["responseStyle"] {
  return input === "balanced" || input === "concise" || input === "deep";
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

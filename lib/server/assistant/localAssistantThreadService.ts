import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type {
  AssistantCreateThreadInput,
  AssistantMessage,
  AssistantMode,
  AssistantThread,
  AssistantThreadDetail,
} from "@/types/assistant";

export class AssistantStoreError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AssistantStoreError";
  }
}

type AssistantThreadRow = {
  id: string;
  userId: string;
  title: string;
  mode: string;
  pinnedMonth: Prisma.JsonValue | null;
  pinnedYear: number | null;
  lastMessagePreview: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type AssistantMessageRow = {
  id: string;
  threadId: string;
  userId: string;
  role: string;
  content: string;
  mode: string;
  monthContext: Prisma.JsonValue | null;
  webSearchUsed: boolean;
  createdAt: Date;
};

export function isAssistantStoreError(error: unknown): error is AssistantStoreError {
  return error instanceof AssistantStoreError;
}

export async function listLocalAssistantThreads(
  userId: string
): Promise<AssistantThread[]> {
  const rows = await prisma.assistantThread.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map(mapThreadRow);
}

export async function createLocalAssistantThread(
  input: AssistantCreateThreadInput & { title?: string }
): Promise<AssistantThread> {
  const mode = input.mode ?? "chat";
  const row = await prisma.assistantThread.create({
    data: {
      userId: input.userId,
      title: input.title ?? getDefaultThreadTitle(mode),
      mode,
      pinnedMonth: (input.pinnedMonth ?? null) as unknown as Prisma.InputJsonValue,
      pinnedYear: input.pinnedYear ?? null,
      lastMessagePreview: "",
      messageCount: 0,
    },
  });

  return mapThreadRow(row);
}

export async function getLocalAssistantThreadDetail(
  threadId: string,
  userId: string
): Promise<AssistantThreadDetail> {
  const thread = await getLocalAssistantThread(threadId, userId);
  const messages = await prisma.assistantMessage.findMany({
    where: { threadId, userId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return {
    thread,
    messages: messages.map(mapMessageRow),
  };
}

export async function appendLocalAssistantMessage(
  threadId: string,
  message: Omit<AssistantMessage, "id" | "threadId" | "createdAt">
): Promise<AssistantMessage> {
  await getLocalAssistantThread(threadId, message.userId);

  const [row] = await prisma.$transaction([
    prisma.assistantMessage.create({
      data: {
        threadId,
        userId: message.userId,
        role: message.role,
        content: message.content,
        mode: message.mode,
        monthContext: (message.monthContext ?? null) as unknown as Prisma.InputJsonValue,
        webSearchUsed: message.webSearchUsed ?? false,
      },
    }),
    prisma.assistantThread.update({
      where: {
        id_userId: {
          id: threadId,
          userId: message.userId,
        },
      },
      data: {
        messageCount: {
          increment: 1,
        },
      },
    }),
  ]);

  return mapMessageRow(row);
}

export async function updateLocalAssistantThreadMetadata(
  threadId: string,
  userId: string,
  updates: {
    title?: string;
    lastMessagePreview?: string;
    mode?: AssistantMode;
    pinnedMonth?: AssistantThread["pinnedMonth"];
    pinnedYear?: AssistantThread["pinnedYear"];
  }
): Promise<void> {
  await getLocalAssistantThread(threadId, userId);

  await prisma.assistantThread.update({
    where: {
      id_userId: {
        id: threadId,
        userId,
      },
    },
    data: {
      ...(updates.title !== undefined ? { title: updates.title } : {}),
      ...(updates.lastMessagePreview !== undefined
        ? { lastMessagePreview: updates.lastMessagePreview }
        : {}),
      ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
      ...(updates.pinnedMonth !== undefined
        ? {
            pinnedMonth: (updates.pinnedMonth ?? null) as unknown as Prisma.InputJsonValue,
          }
        : {}),
      ...(updates.pinnedYear !== undefined ? { pinnedYear: updates.pinnedYear } : {}),
    },
  });
}

export async function deleteLocalAssistantThread(
  threadId: string,
  userId: string
): Promise<void> {
  await getLocalAssistantThread(threadId, userId);

  await prisma.$transaction([
    prisma.assistantMessage.deleteMany({
      where: { threadId, userId },
    }),
    prisma.assistantThread.delete({
      where: {
        id_userId: {
          id: threadId,
          userId,
        },
      },
    }),
  ]);
}

export async function getLocalAssistantThread(
  threadId: string,
  userId: string
): Promise<AssistantThread> {
  const row = await prisma.assistantThread.findFirst({
    where: { id: threadId, userId },
  });

  if (!row) {
    throw new AssistantStoreError(404, "Thread non trovato");
  }

  return mapThreadRow(row);
}

function mapThreadRow(row: AssistantThreadRow): AssistantThread {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessagePreview: row.lastMessagePreview,
    messageCount: row.messageCount,
    mode: row.mode as AssistantMode,
    pinnedMonth: isMonthSelector(row.pinnedMonth) ? row.pinnedMonth : null,
    pinnedYear: row.pinnedYear,
  };
}

function mapMessageRow(row: AssistantMessageRow): AssistantMessage {
  return {
    id: row.id,
    threadId: row.threadId,
    userId: row.userId,
    role: row.role as AssistantMessage["role"],
    content: row.content,
    createdAt: row.createdAt,
    mode: row.mode as AssistantMode,
    monthContext: isMonthSelector(row.monthContext) ? row.monthContext : null,
    webSearchUsed: row.webSearchUsed,
  };
}

export function buildLocalThreadTitleFromPrompt(
  prompt: string,
  mode: AssistantMode
): string {
  const collapsedPrompt = prompt.trim().replace(/\s+/g, " ");
  if (!collapsedPrompt) {
    return getDefaultThreadTitle(mode);
  }

  return collapsedPrompt.slice(0, 60);
}

function getDefaultThreadTitle(mode: AssistantMode): string {
  if (mode === "month_analysis") return "Nuova analisi mensile";
  if (mode === "year_analysis") return "Nuova analisi annuale";
  if (mode === "ytd_analysis") return "Nuova analisi YTD";
  if (mode === "history_analysis") return "Nuova analisi storico";
  if (mode === "quarter_analysis") return "Nuova analisi trimestrale";
  return "Nuova conversazione";
}

function isMonthSelector(input: unknown): input is { year: number; month: number } {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    typeof (input as { year?: unknown }).year === "number" &&
    typeof (input as { month?: unknown }).month === "number"
  );
}

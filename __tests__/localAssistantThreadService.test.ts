import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    assistantMessage: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    assistantThread: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  AssistantStoreError,
  appendLocalAssistantMessage,
  createLocalAssistantThread,
  deleteLocalAssistantThread,
  getLocalAssistantThreadDetail,
  listLocalAssistantThreads,
  updateLocalAssistantThreadMetadata,
} from "@/lib/server/assistant/localAssistantThreadService";

const threadRow = {
  id: "thread-1",
  userId: "user-1",
  title: "Nuova conversazione",
  mode: "chat",
  pinnedMonth: null,
  pinnedYear: null,
  lastMessagePreview: "",
  messageCount: 0,
  createdAt: new Date("2026-05-19T10:00:00.000Z"),
  updatedAt: new Date("2026-05-19T10:00:00.000Z"),
};

describe("local assistant thread service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists threads scoped to the authenticated user", async () => {
    prismaMock.assistantThread.findMany.mockResolvedValue([threadRow]);

    await expect(listLocalAssistantThreads("user-1")).resolves.toEqual([
      {
        id: "thread-1",
        userId: "user-1",
        title: "Nuova conversazione",
        createdAt: new Date("2026-05-19T10:00:00.000Z"),
        updatedAt: new Date("2026-05-19T10:00:00.000Z"),
        lastMessagePreview: "",
        messageCount: 0,
        mode: "chat",
        pinnedMonth: null,
        pinnedYear: null,
      },
    ]);
    expect(prismaMock.assistantThread.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("creates a user-scoped thread with defaults", async () => {
    prismaMock.assistantThread.create.mockResolvedValue({
      ...threadRow,
      mode: "month_analysis",
      title: "Nuova analisi mensile",
      pinnedMonth: { year: 2026, month: 5 },
    });

    const thread = await createLocalAssistantThread({
      userId: "user-1",
      mode: "month_analysis",
      pinnedMonth: { year: 2026, month: 5 },
    });

    expect(prismaMock.assistantThread.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        title: "Nuova analisi mensile",
        mode: "month_analysis",
        pinnedMonth: { year: 2026, month: 5 },
        pinnedYear: null,
        lastMessagePreview: "",
        messageCount: 0,
      },
    });
    expect(thread.pinnedMonth).toEqual({ year: 2026, month: 5 });
  });

  it("returns thread detail with messages in chronological order", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue(threadRow);
    prismaMock.assistantMessage.findMany.mockResolvedValue([
      {
        id: "message-1",
        threadId: "thread-1",
        userId: "user-1",
        role: "user",
        content: "Ciao",
        mode: "chat",
        monthContext: null,
        webSearchUsed: false,
        createdAt: new Date("2026-05-19T10:01:00.000Z"),
      },
    ]);

    const detail = await getLocalAssistantThreadDetail("thread-1", "user-1");

    expect(prismaMock.assistantThread.findFirst).toHaveBeenCalledWith({
      where: { id: "thread-1", userId: "user-1" },
    });
    expect(prismaMock.assistantMessage.findMany).toHaveBeenCalledWith({
      where: { threadId: "thread-1", userId: "user-1" },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    expect(detail.messages).toHaveLength(1);
  });

  it("throws a store error when the thread does not belong to the user", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue(null);

    await expect(
      getLocalAssistantThreadDetail("thread-1", "user-1")
    ).rejects.toBeInstanceOf(AssistantStoreError);
  });

  it("deletes a thread and its messages in one transaction", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue(threadRow);
    prismaMock.assistantMessage.deleteMany.mockResolvedValue({ count: 2 });
    prismaMock.assistantThread.delete.mockResolvedValue(threadRow);

    await deleteLocalAssistantThread("thread-1", "user-1");

    expect(prismaMock.assistantMessage.deleteMany).toHaveBeenCalledWith({
      where: { threadId: "thread-1", userId: "user-1" },
    });
    expect(prismaMock.assistantThread.delete).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "thread-1",
          userId: "user-1",
        },
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("appends a message only after verifying thread ownership", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue(threadRow);
    prismaMock.assistantMessage.create.mockResolvedValue({
      id: "message-1",
      threadId: "thread-1",
      userId: "user-1",
      role: "assistant",
      content: "Risposta",
      mode: "chat",
      monthContext: null,
      webSearchUsed: true,
      createdAt: new Date("2026-05-19T10:02:00.000Z"),
    });
    prismaMock.assistantThread.update.mockResolvedValue({
      ...threadRow,
      messageCount: 1,
    });

    const message = await appendLocalAssistantMessage("thread-1", {
      userId: "user-1",
      role: "assistant",
      content: "Risposta",
      mode: "chat",
      monthContext: null,
      webSearchUsed: true,
    });

    expect(prismaMock.assistantThread.findFirst).toHaveBeenCalledWith({
      where: { id: "thread-1", userId: "user-1" },
    });
    expect(prismaMock.assistantMessage.create).toHaveBeenCalledWith({
      data: {
        threadId: "thread-1",
        userId: "user-1",
        role: "assistant",
        content: "Risposta",
        mode: "chat",
        monthContext: null,
        webSearchUsed: true,
      },
    });
    expect(prismaMock.assistantThread.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "thread-1",
          userId: "user-1",
        },
      },
      data: {
        messageCount: {
          increment: 1,
        },
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(message.id).toBe("message-1");
  });

  it("updates thread metadata scoped to the authenticated user", async () => {
    prismaMock.assistantThread.findFirst.mockResolvedValue(threadRow);
    prismaMock.assistantThread.update.mockResolvedValue({
      ...threadRow,
      title: "Titolo server",
      lastMessagePreview: "Risposta",
      messageCount: 2,
      updatedAt: new Date("2026-05-19T10:03:00.000Z"),
    });

    await updateLocalAssistantThreadMetadata("thread-1", "user-1", {
      title: "Titolo server",
      lastMessagePreview: "Risposta",
      mode: "chat",
      pinnedMonth: null,
      pinnedYear: null,
    });

    expect(prismaMock.assistantThread.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "thread-1",
          userId: "user-1",
        },
      },
      data: {
        title: "Titolo server",
        lastMessagePreview: "Risposta",
        mode: "chat",
        pinnedMonth: null,
        pinnedYear: null,
      },
    });
  });
});

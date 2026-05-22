import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    assistantMemoryItem: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    assistantMemorySuggestion: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    monthlySnapshot: {
      count: vi.fn(),
    },
    userSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  deleteLocalAssistantMemoryDocument,
  getLocalAssistantMemoryDocument,
  setLocalAssistantGoalEvaluation,
  updateLocalAssistantMemoryDocument,
} from "@/lib/server/assistant/localAssistantMemoryService";

const itemRow = {
  id: "goal-1",
  userId: "user-1",
  category: "goal",
  text: "Liquidita a 40000 EUR",
  structuredGoal: {
    kind: "liquid_net_worth_target",
    targetValue: 40000,
    unit: "eur",
  },
  sourceThreadId: "thread-1",
  sourceMessageId: "message-1",
  status: "active",
  completedAt: null,
  derivedFromContext: false,
  evidenceSummary: null,
  lastEvaluationAt: null,
  lastEvaluationResult: null,
  legacyFirebaseId: null,
  createdAt: new Date("2026-05-20T10:00:00.000Z"),
  updatedAt: new Date("2026-05-20T10:00:00.000Z"),
};

const suggestionRow = {
  id: "suggestion-1",
  userId: "user-1",
  itemId: "goal-1",
  type: "complete_goal",
  status: "pending",
  evidenceSummary: "Liquidita attuale 45000 EUR su target 40000 EUR",
  evaluation: {
    matched: true,
    metricValue: 45000,
    targetValue: 40000,
    unit: "eur",
    evaluatedAgainst: "liquid_net_worth",
    summary: "Liquidita attuale 45000 EUR su target 40000 EUR",
  },
  legacyFirebaseId: null,
  createdAt: new Date("2026-05-20T10:01:00.000Z"),
  updatedAt: new Date("2026-05-20T10:01:00.000Z"),
};

describe("local assistant memory service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.userSetting.findUnique.mockResolvedValue({
      userId: "user-1",
      data: {
        assistantResponseStyle: "deep",
        assistantMacroContextEnabled: true,
        assistantMemoryEnabled: false,
        assistantIncludeDummySnapshots: true,
      },
    });
    prismaMock.assistantMemoryItem.findMany.mockResolvedValue([itemRow]);
    prismaMock.assistantMemorySuggestion.findMany.mockResolvedValue([suggestionRow]);
    prismaMock.monthlySnapshot.count.mockResolvedValue(1);
  });

  it("returns preferences, memory items, suggestions, and dummy snapshot availability", async () => {
    await expect(getLocalAssistantMemoryDocument("user-1")).resolves.toMatchObject({
      preferences: {
        responseStyle: "deep",
        includeMacroContext: true,
        memoryEnabled: false,
        includeDummySnapshots: true,
      },
      items: [
        {
          id: "goal-1",
          userId: "user-1",
          category: "goal",
          status: "active",
        },
      ],
      suggestions: [
        {
          id: "suggestion-1",
          userId: "user-1",
          itemId: "goal-1",
          status: "pending",
        },
      ],
      hasDummySnapshots: true,
    });
    expect(prismaMock.assistantMemoryItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
    });
    expect(prismaMock.monthlySnapshot.count).toHaveBeenCalledWith({
      where: { userId: "user-1", isDummy: true },
      take: 1,
    });
  });

  it("upserts preferences and a memory item for the authenticated user", async () => {
    prismaMock.assistantMemoryItem.upsert.mockResolvedValue(itemRow);

    await updateLocalAssistantMemoryDocument("user-1", {
      preferences: {
        responseStyle: "balanced",
        includeMacroContext: false,
      },
      item: {
        id: "goal-1",
        category: "goal",
        text: "Liquidita a 40000 EUR",
      },
    });

    expect(prismaMock.userSetting.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        data: expect.objectContaining({
          assistantResponseStyle: "balanced",
          assistantMacroContextEnabled: false,
        }),
      },
      update: {
        data: expect.objectContaining({
          assistantResponseStyle: "balanced",
          assistantMacroContextEnabled: false,
        }),
      },
    });
    expect(prismaMock.assistantMemoryItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_userId: {
            id: "goal-1",
            userId: "user-1",
          },
        },
      })
    );
  });

  it("deletes one memory item and its suggestions", async () => {
    await deleteLocalAssistantMemoryDocument("user-1", { itemId: "goal-1" });

    expect(prismaMock.assistantMemorySuggestion.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", itemId: "goal-1" },
    });
    expect(prismaMock.assistantMemoryItem.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", id: "goal-1" },
    });
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("stores a goal evaluation on the matching memory item", async () => {
    await setLocalAssistantGoalEvaluation("user-1", "goal-1", {
      matched: true,
      metricValue: 45000,
      targetValue: 40000,
      unit: "eur",
      evaluatedAgainst: "liquid_net_worth",
      summary: "Target raggiunto",
    });

    expect(prismaMock.assistantMemoryItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_userId: {
            id: "goal-1",
            userId: "user-1",
          },
        },
        update: expect.objectContaining({
          lastEvaluationResult: expect.objectContaining({
            summary: "Target raggiunto",
          }),
        }),
      })
    );
  });
});

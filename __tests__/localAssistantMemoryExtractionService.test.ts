import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  dedupeMemoryItemsMock,
  extractMemoryCandidatesMock,
  updateLocalAssistantMemoryDocumentMock,
} = vi.hoisted(() => ({
  dedupeMemoryItemsMock: vi.fn(),
  extractMemoryCandidatesMock: vi.fn(),
  updateLocalAssistantMemoryDocumentMock: vi.fn(),
}));

vi.mock("@/lib/server/assistant/memoryExtraction", () => ({
  dedupeMemoryItems: dedupeMemoryItemsMock,
  extractMemoryCandidates: extractMemoryCandidatesMock,
}));

vi.mock("@/lib/server/assistant/localAssistantMemoryService", () => ({
  updateLocalAssistantMemoryDocument: updateLocalAssistantMemoryDocumentMock,
}));

import { extractAndSaveLocalAssistantMemory } from "@/lib/server/assistant/localAssistantMemoryExtractionService";
import type { AssistantMemoryDocument } from "@/types/assistant";

const memoryDocument = {
  preferences: {
    responseStyle: "balanced",
    includeMacroContext: false,
    memoryEnabled: true,
    includeDummySnapshots: false,
  },
  items: [
    {
      id: "existing-1",
      userId: "user-1",
      category: "preference",
      text: "Preferisce sintesi concise",
      createdAt: new Date("2026-05-20T09:00:00.000Z"),
      updatedAt: new Date("2026-05-20T09:00:00.000Z"),
      status: "active",
    },
  ],
  suggestions: [],
  updatedAt: null,
  hasDummySnapshots: false,
} satisfies AssistantMemoryDocument;

describe("local assistant memory extraction service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractMemoryCandidatesMock.mockResolvedValue([
      {
        category: "goal",
        text: "Vuole raggiungere 50000 EUR di liquidita",
      },
    ]);
    dedupeMemoryItemsMock.mockReturnValue([
      {
        category: "goal",
        text: "Vuole raggiungere 50000 EUR di liquidita",
      },
    ]);
  });

  it("extracts, deduplicates, and persists local memory candidates", async () => {
    await extractAndSaveLocalAssistantMemory({
      userId: "user-1",
      threadId: "thread-1",
      messageId: "assistant-message-1",
      userMessage: "Voglio arrivare a 50000 EUR di liquidita",
      assistantMessage: "Ottimo obiettivo.",
      memoryDocument,
      anthropicClient: {} as never,
      idFactory: () => "memory-1",
    });

    expect(extractMemoryCandidatesMock).toHaveBeenCalledWith(
      "Voglio arrivare a 50000 EUR di liquidita",
      "Ottimo obiettivo.",
      {}
    );
    expect(dedupeMemoryItemsMock).toHaveBeenCalledWith(
      [
        {
          category: "goal",
          text: "Vuole raggiungere 50000 EUR di liquidita",
        },
      ],
      memoryDocument.items
    );
    expect(updateLocalAssistantMemoryDocumentMock).toHaveBeenCalledWith("user-1", {
      item: {
        id: "memory-1",
        category: "goal",
        text: "Vuole raggiungere 50000 EUR di liquidita",
        sourceThreadId: "thread-1",
        sourceMessageId: "assistant-message-1",
        status: "active",
      },
    });
  });

  it("does not extract when assistant memory is disabled", async () => {
    await extractAndSaveLocalAssistantMemory({
      userId: "user-1",
      threadId: "thread-1",
      messageId: "assistant-message-1",
      userMessage: "Ricordami questo",
      assistantMessage: "Ok",
      memoryDocument: {
        ...memoryDocument,
        preferences: {
          ...memoryDocument.preferences,
          memoryEnabled: false,
        },
      },
      anthropicClient: {} as never,
    });

    expect(extractMemoryCandidatesMock).not.toHaveBeenCalled();
    expect(updateLocalAssistantMemoryDocumentMock).not.toHaveBeenCalled();
  });
});

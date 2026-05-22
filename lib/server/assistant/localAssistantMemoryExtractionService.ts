import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  dedupeMemoryItems,
  extractMemoryCandidates,
} from "@/lib/server/assistant/memoryExtraction";
import { updateLocalAssistantMemoryDocument } from "@/lib/server/assistant/localAssistantMemoryService";
import type { AssistantMemoryDocument } from "@/types/assistant";

type ExtractAndSaveLocalAssistantMemoryInput = {
  userId: string;
  threadId: string;
  messageId: string;
  userMessage: string;
  assistantMessage: string;
  memoryDocument: AssistantMemoryDocument | null;
  anthropicClient?: Anthropic;
  idFactory?: () => string;
};

export async function extractAndSaveLocalAssistantMemory({
  userId,
  threadId,
  messageId,
  userMessage,
  assistantMessage,
  memoryDocument,
  anthropicClient,
  idFactory = createMemoryItemId,
}: ExtractAndSaveLocalAssistantMemoryInput): Promise<void> {
  try {
    if (!memoryDocument?.preferences.memoryEnabled) return;

    const client =
      anthropicClient ??
      new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const candidates = await extractMemoryCandidates(
      userMessage,
      assistantMessage,
      client
    );
    const newCandidates = dedupeMemoryItems(candidates, memoryDocument.items);

    for (const candidate of newCandidates) {
      await updateLocalAssistantMemoryDocument(userId, {
        item: {
          id: idFactory(),
          category: candidate.category,
          text: candidate.text,
          sourceThreadId: threadId,
          sourceMessageId: messageId,
          status: "active",
        },
      });
    }
  } catch (error) {
    console.error("[LOCAL_ASSISTANT_MEMORY_EXTRACTION_ERROR]", error);
  }
}

function createMemoryItemId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

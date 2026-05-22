import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  appendLocalAssistantMessageMock,
  buildAssistantMonthContextMock,
  createLocalAssistantThreadMock,
  getLocalAssistantMemoryDocumentMock,
  getLocalAssistantThreadDetailMock,
  getLocalAssistantThreadMock,
  requireFirebaseAuthMock,
  requireUserSessionMock,
  extractAndSaveLocalAssistantMemoryMock,
  streamAssistantResponseMock,
  updateLocalAssistantThreadMetadataMock,
} = vi.hoisted(() => ({
  appendLocalAssistantMessageMock: vi.fn(),
  buildAssistantMonthContextMock: vi.fn(),
  createLocalAssistantThreadMock: vi.fn(),
  getLocalAssistantMemoryDocumentMock: vi.fn(),
  getLocalAssistantThreadDetailMock: vi.fn(),
  getLocalAssistantThreadMock: vi.fn(),
  requireFirebaseAuthMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  extractAndSaveLocalAssistantMemoryMock: vi.fn(),
  streamAssistantResponseMock: vi.fn(),
  updateLocalAssistantThreadMetadataMock: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  AuthSessionError: class AuthSessionError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = "AuthSessionError";
    }
  },
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/apiAuth", () => ({
  assertSameUser: vi.fn(),
  getApiAuthErrorResponse: vi.fn((error) => {
    if (error?.message === "Missing Authorization bearer token") {
      return Response.json({ error: error.message }, { status: 401 });
    }
    return null;
  }),
  requireFirebaseAuth: requireFirebaseAuthMock,
}));

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(async () => ({ data: () => ({}) })),
      })),
    })),
  },
}));

vi.mock("@/lib/server/assistant/store", () => ({
  appendAssistantMessage: vi.fn(),
  buildThreadTitleFromPrompt: vi.fn(() => "Titolo server"),
  createAssistantThread: vi.fn(),
  getAssistantMemoryDocument: vi.fn(async () => ({
    preferences: {
      responseStyle: "balanced",
      includeMacroContext: false,
      memoryEnabled: false,
      includeDummySnapshots: false,
    },
    items: [],
    suggestions: [],
    updatedAt: null,
    hasDummySnapshots: false,
  })),
  getAssistantThread: vi.fn(),
  getAssistantThreadDetail: vi.fn(),
  isAssistantStoreError: vi.fn(() => false),
  updateAssistantMemoryDocument: vi.fn(),
  updateAssistantThreadMetadata: vi.fn(),
}));

vi.mock("@/lib/server/assistant/localAssistantThreadService", () => ({
  appendLocalAssistantMessage: appendLocalAssistantMessageMock,
  buildLocalThreadTitleFromPrompt: vi.fn(() => "Titolo server"),
  createLocalAssistantThread: createLocalAssistantThreadMock,
  getLocalAssistantThread: getLocalAssistantThreadMock,
  getLocalAssistantThreadDetail: getLocalAssistantThreadDetailMock,
  isAssistantStoreError: vi.fn(() => false),
  updateLocalAssistantThreadMetadata: updateLocalAssistantThreadMetadataMock,
}));

vi.mock("@/lib/server/assistant/localAssistantMemoryService", () => ({
  getLocalAssistantMemoryDocument: getLocalAssistantMemoryDocumentMock,
}));

vi.mock("@/lib/server/assistant/localAssistantMemoryExtractionService", () => ({
  extractAndSaveLocalAssistantMemory: extractAndSaveLocalAssistantMemoryMock,
}));

vi.mock("@/lib/server/assistant/anthropicStream", () => ({
  streamAssistantResponse: streamAssistantResponseMock,
}));

vi.mock("@/lib/services/assistantMonthContextService", () => ({
  buildAssistantHistoryContext: vi.fn(),
  buildAssistantMonthContext: buildAssistantMonthContextMock,
  buildAssistantYearContext: vi.fn(),
  buildAssistantYtdContext: vi.fn(),
}));

import { POST } from "@/app/api/ai/assistant/stream/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const thread = {
  id: "thread-1",
  userId: "user-1",
  title: "Titolo server",
  createdAt: new Date("2026-05-20T10:00:00.000Z"),
  updatedAt: new Date("2026-05-20T10:00:00.000Z"),
  lastMessagePreview: "",
  messageCount: 0,
  mode: "month_analysis",
  pinnedMonth: { year: 2026, month: 5 },
  pinnedYear: null,
};

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/assistant/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local assistant stream route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    requireFirebaseAuthMock.mockRejectedValue(
      new Error("Missing Authorization bearer token")
    );
    createLocalAssistantThreadMock.mockResolvedValue(thread);
    getLocalAssistantThreadMock.mockResolvedValue(thread);
    getLocalAssistantThreadDetailMock.mockResolvedValue({
      thread,
      messages: [],
    });
    getLocalAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: "deep",
        includeMacroContext: false,
        memoryEnabled: true,
        includeDummySnapshots: false,
      },
      items: [
        {
          id: "memory-active",
          userId: "user-1",
          category: "preference",
          text: "Preferisce risposte con esempi numerici",
          createdAt: new Date("2026-05-20T09:00:00.000Z"),
          updatedAt: new Date("2026-05-20T09:00:00.000Z"),
          status: "active",
        },
        {
          id: "memory-archived",
          userId: "user-1",
          category: "fact",
          text: "Dato vecchio",
          createdAt: new Date("2026-05-19T09:00:00.000Z"),
          updatedAt: new Date("2026-05-19T09:00:00.000Z"),
          status: "archived",
        },
      ],
      suggestions: [],
      updatedAt: new Date("2026-05-20T09:00:00.000Z"),
      hasDummySnapshots: false,
    });
    appendLocalAssistantMessageMock
      .mockResolvedValueOnce({
        id: "user-message-1",
        threadId: "thread-1",
        userId: "user-1",
        role: "user",
        content: "Analizza il mese",
        createdAt: new Date("2026-05-20T10:01:00.000Z"),
        mode: "month_analysis",
        monthContext: { year: 2026, month: 5 },
        webSearchUsed: false,
      })
      .mockResolvedValueOnce({
        id: "assistant-message-1",
        threadId: "thread-1",
        userId: "user-1",
        role: "assistant",
        content: "Risposta",
        createdAt: new Date("2026-05-20T10:02:00.000Z"),
        mode: "month_analysis",
        monthContext: { year: 2026, month: 5 },
        webSearchUsed: false,
      });
    buildAssistantMonthContextMock.mockResolvedValue({
      selector: { year: 2026, month: 5 },
      currentSnapshot: null,
      previousSnapshot: null,
      cashflow: {
        totalIncome: 0,
        totalExpenses: 0,
        totalDividends: 0,
        netCashFlow: 0,
        transactionCount: 0,
      },
      netWorth: {
        start: null,
        end: null,
        delta: null,
        deltaPct: null,
      },
      allocationChanges: [],
      topExpensesByCategory: [],
      topIndividualExpenses: [],
      bySubCategoryAllocation: {},
      dataQuality: {
        hasSnapshot: false,
        hasPreviousBaseline: false,
        hasCashflowData: false,
        isPartialMonth: true,
        notes: [],
      },
    });
    streamAssistantResponseMock.mockImplementation(async ({ onStatus, onText }) => {
      onStatus("writing");
      onText("Risposta");
      return { text: "Risposta", webSearchUsed: false };
    });
    updateLocalAssistantThreadMetadataMock.mockResolvedValue(undefined);
    extractAndSaveLocalAssistantMemoryMock.mockResolvedValue(undefined);
  });

  it("streams with the local session and persists messages for that user", async () => {
    const response = await POST(
      createRequest({
        userId: "malicious-user",
        mode: "month_analysis",
        prompt: "Analizza il mese",
        month: { year: 2026, month: 5 },
        preferences: {
          responseStyle: "balanced",
          includeMacroContext: true,
          memoryEnabled: false,
          includeDummySnapshots: false,
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const streamText = await response.text();
    expect(streamText).toContain('"type":"meta"');
    expect(streamText).toContain('"type":"text"');
    expect(streamText).toContain('"type":"done"');
    expect(requireUserSessionMock).toHaveBeenCalled();
    expect(requireFirebaseAuthMock).not.toHaveBeenCalled();
    expect(createLocalAssistantThreadMock).toHaveBeenCalledWith({
      userId: "user-1",
      mode: "month_analysis",
      pinnedMonth: { year: 2026, month: 5 },
      pinnedYear: null,
      title: "Titolo server",
    });
    expect(appendLocalAssistantMessageMock).toHaveBeenCalledWith("thread-1", {
      userId: "user-1",
      role: "user",
      content: "Analizza il mese",
      mode: "month_analysis",
      monthContext: { year: 2026, month: 5 },
      webSearchUsed: false,
    });
    expect(updateLocalAssistantThreadMetadataMock).toHaveBeenCalledWith(
      "thread-1",
      "user-1",
      expect.objectContaining({
        lastMessagePreview: "Risposta",
      })
    );
  });

  it("injects active local memory items and persisted preferences into the stream", async () => {
    const response = await POST(
      createRequest({
        mode: "chat",
        prompt: "Cosa dovrei controllare?",
        preferences: {
          includeMacroContext: true,
        },
      })
    );

    expect(response.status).toBe(200);
    await response.text();

    expect(getLocalAssistantMemoryDocumentMock).toHaveBeenCalledWith("user-1");
    expect(streamAssistantResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          responseStyle: "deep",
          includeMacroContext: true,
          memoryEnabled: true,
        }),
        memoryItems: [
          expect.objectContaining({
            id: "memory-active",
            text: "Preferisce risposte con esempi numerici",
          }),
        ],
        enableWebSearch: true,
      })
    );
  });

  it("starts local memory extraction after a successful assistant response", async () => {
    const response = await POST(
      createRequest({
        mode: "chat",
        prompt: "Voglio arrivare a 50000 EUR di liquidita",
      })
    );

    expect(response.status).toBe(200);
    await response.text();

    expect(extractAndSaveLocalAssistantMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        threadId: "thread-1",
        messageId: "assistant-message-1",
        userMessage: "Voglio arrivare a 50000 EUR di liquidita",
        assistantMessage: "Risposta",
        memoryDocument: expect.objectContaining({
          preferences: expect.objectContaining({
            memoryEnabled: true,
          }),
        }),
      })
    );
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(
      createRequest({
        mode: "chat",
        prompt: "Ciao",
      })
    );

    expect(response.status).toBe(401);
    expect(streamAssistantResponseMock).not.toHaveBeenCalled();
  });
});

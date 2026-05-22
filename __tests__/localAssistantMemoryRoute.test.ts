import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  deleteLocalAssistantMemoryDocumentMock,
  getLocalAssistantMemoryDocumentMock,
  requireFirebaseAuthMock,
  requireUserSessionMock,
  setLocalAssistantGoalEvaluationMock,
  updateLocalAssistantMemoryDocumentMock,
} = vi.hoisted(() => ({
  deleteLocalAssistantMemoryDocumentMock: vi.fn(),
  getLocalAssistantMemoryDocumentMock: vi.fn(),
  requireFirebaseAuthMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  setLocalAssistantGoalEvaluationMock: vi.fn(),
  updateLocalAssistantMemoryDocumentMock: vi.fn(),
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
  getApiAuthErrorResponse: vi.fn(),
  requireFirebaseAuth: requireFirebaseAuthMock,
}));

vi.mock("@/lib/server/assistant/localAssistantMemoryService", () => ({
  deleteLocalAssistantMemoryDocument: deleteLocalAssistantMemoryDocumentMock,
  getLocalAssistantMemoryDocument: getLocalAssistantMemoryDocumentMock,
  isAssistantStoreError: vi.fn(() => false),
  setLocalAssistantGoalEvaluation: setLocalAssistantGoalEvaluationMock,
  updateLocalAssistantMemoryDocument: updateLocalAssistantMemoryDocumentMock,
}));

import {
  DELETE,
  GET,
  PATCH,
} from "@/app/api/ai/assistant/memory/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const memoryDocument = {
  preferences: {
    responseStyle: "balanced",
    includeMacroContext: false,
    memoryEnabled: true,
    includeDummySnapshots: false,
  },
  items: [],
  suggestions: [],
  updatedAt: new Date("2026-05-20T10:00:00.000Z"),
  hasDummySnapshots: false,
};

function createRequest(
  url: string,
  method = "GET",
  body?: unknown
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("local assistant memory route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    requireFirebaseAuthMock.mockRejectedValue(
      new Error("Missing Authorization bearer token")
    );
    getLocalAssistantMemoryDocumentMock.mockResolvedValue(memoryDocument);
    updateLocalAssistantMemoryDocumentMock.mockResolvedValue(memoryDocument);
    deleteLocalAssistantMemoryDocumentMock.mockResolvedValue(memoryDocument);
    setLocalAssistantGoalEvaluationMock.mockResolvedValue(memoryDocument);
  });

  it("returns memory for the authenticated local user and ignores query userId", async () => {
    const response = await GET(
      createRequest("http://localhost/api/ai/assistant/memory?userId=malicious-user")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preferences: {
        responseStyle: "balanced",
      },
    });
    expect(requireUserSessionMock).toHaveBeenCalled();
    expect(requireFirebaseAuthMock).not.toHaveBeenCalled();
    expect(getLocalAssistantMemoryDocumentMock).toHaveBeenCalledWith("user-1");
  });

  it("patches memory for the authenticated local user", async () => {
    const response = await PATCH(
      createRequest("http://localhost/api/ai/assistant/memory", "PATCH", {
        userId: "malicious-user",
        preferences: {
          responseStyle: "deep",
        },
        item: {
          id: "goal-1",
          category: "goal",
          text: "Liquidita a 40000 EUR",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(updateLocalAssistantMemoryDocumentMock).toHaveBeenCalledWith("user-1", {
      preferences: {
        responseStyle: "deep",
      },
      item: {
        id: "goal-1",
        category: "goal",
        text: "Liquidita a 40000 EUR",
      },
      suggestion: undefined,
    });
  });

  it("accepts a goal suggestion through the local service", async () => {
    getLocalAssistantMemoryDocumentMock.mockResolvedValue({
      ...memoryDocument,
      items: [
        {
          id: "goal-1",
          userId: "user-1",
          category: "goal",
          text: "Liquidita",
          createdAt: new Date("2026-05-20T10:00:00.000Z"),
          updatedAt: new Date("2026-05-20T10:00:00.000Z"),
          status: "active",
        },
      ],
      suggestions: [
        {
          id: "suggestion-1",
          userId: "user-1",
          itemId: "goal-1",
          type: "complete_goal",
          status: "pending",
          createdAt: new Date("2026-05-20T10:00:00.000Z"),
          updatedAt: new Date("2026-05-20T10:00:00.000Z"),
          evidenceSummary: "Target raggiunto",
          evaluation: {
            matched: true,
            metricValue: 45000,
            targetValue: 40000,
            unit: "eur",
            evaluatedAgainst: "liquid_net_worth",
            summary: "Target raggiunto",
          },
        },
      ],
    });

    const response = await PATCH(
      createRequest("http://localhost/api/ai/assistant/memory", "PATCH", {
        action: "acceptSuggestion",
        suggestionId: "suggestion-1",
        itemId: "goal-1",
      })
    );

    expect(response.status).toBe(200);
    expect(setLocalAssistantGoalEvaluationMock).toHaveBeenCalledWith(
      "user-1",
      "goal-1",
      expect.objectContaining({
        summary: "Target raggiunto",
      })
    );
    expect(updateLocalAssistantMemoryDocumentMock).toHaveBeenCalled();
  });

  it("deletes memory data for the authenticated local user", async () => {
    const response = await DELETE(
      createRequest("http://localhost/api/ai/assistant/memory", "DELETE", {
        userId: "malicious-user",
        itemId: "goal-1",
      })
    );

    expect(response.status).toBe(200);
    expect(deleteLocalAssistantMemoryDocumentMock).toHaveBeenCalledWith("user-1", {
      itemId: "goal-1",
      resetAll: undefined,
    });
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET(
      createRequest("http://localhost/api/ai/assistant/memory")
    );

    expect(response.status).toBe(401);
    expect(getLocalAssistantMemoryDocumentMock).not.toHaveBeenCalled();
  });
});

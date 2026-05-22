import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  getLocalAssistantMemoryDocumentMock,
  requireUserSessionMock,
  updateLocalAssistantMemoryDocumentMock,
} = vi.hoisted(() => ({
  getLocalAssistantMemoryDocumentMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
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

vi.mock("@/lib/server/assistant/localAssistantMemoryService", () => ({
  deleteLocalAssistantMemoryDocument: vi.fn(),
  getLocalAssistantMemoryDocument: getLocalAssistantMemoryDocumentMock,
  isAssistantStoreError: vi.fn(() => false),
  setLocalAssistantGoalEvaluation: vi.fn(),
  updateLocalAssistantMemoryDocument: updateLocalAssistantMemoryDocumentMock,
}));

import {
  GET as getMemoryRoute,
  PATCH as patchMemoryRoute,
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
  updatedAt: null,
  hasDummySnapshots: false,
};

function createJsonRequest(
  url: string,
  {
    method = "GET",
    body,
  }: {
    method?: string;
    body?: unknown;
  } = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("Assistant private API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalAssistantMemoryDocumentMock.mockResolvedValue(memoryDocument);
    updateLocalAssistantMemoryDocumentMock.mockResolvedValue({
      ...memoryDocument,
      preferences: {
        ...memoryDocument.preferences,
        responseStyle: "deep",
      },
    });
  });

  it("returns 401 for memory route without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await getMemoryRoute(
      createJsonRequest("http://localhost/api/ai/assistant/memory")
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
    expect(getLocalAssistantMemoryDocumentMock).not.toHaveBeenCalled();
  });

  it("patches memory only for the authenticated local user", async () => {
    const response = await patchMemoryRoute(
      createJsonRequest("http://localhost/api/ai/assistant/memory", {
        method: "PATCH",
        body: {
          userId: "malicious-user",
          preferences: {
            responseStyle: "deep",
            includeMacroContext: true,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preferences: {
        responseStyle: "deep",
      },
    });
    expect(updateLocalAssistantMemoryDocumentMock).toHaveBeenCalledWith("user-1", {
      preferences: {
        responseStyle: "deep",
        includeMacroContext: true,
      },
      item: undefined,
      suggestion: undefined,
    });
  });
});

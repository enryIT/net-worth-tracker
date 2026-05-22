import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  deleteLocalAssistantThreadMock,
  getLocalAssistantThreadDetailMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  deleteLocalAssistantThreadMock: vi.fn(),
  getLocalAssistantThreadDetailMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
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

vi.mock("@/lib/server/assistant/localAssistantThreadService", () => ({
  deleteLocalAssistantThread: deleteLocalAssistantThreadMock,
  getLocalAssistantThreadDetail: getLocalAssistantThreadDetailMock,
  isAssistantStoreError: vi.fn(() => false),
}));

import {
  DELETE,
  GET,
} from "@/app/api/ai/assistant/threads/[threadId]/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createRequest(method = "GET"): NextRequest {
  return new NextRequest("http://localhost/api/ai/assistant/threads/thread-1?userId=malicious-user", {
    method,
  });
}

describe("local assistant thread detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalAssistantThreadDetailMock.mockResolvedValue({
      thread: {
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
      messages: [],
    });
    deleteLocalAssistantThreadMock.mockResolvedValue(undefined);
  });

  it("loads thread detail for the authenticated local user", async () => {
    const response = await GET(createRequest(), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(200);
    expect(getLocalAssistantThreadDetailMock).toHaveBeenCalledWith("thread-1", "user-1");
  });

  it("deletes threads for the authenticated local user", async () => {
    const response = await DELETE(createRequest("DELETE"), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(200);
    expect(deleteLocalAssistantThreadMock).toHaveBeenCalledWith("thread-1", "user-1");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET(createRequest(), {
      params: Promise.resolve({ threadId: "thread-1" }),
    });

    expect(response.status).toBe(401);
    expect(getLocalAssistantThreadDetailMock).not.toHaveBeenCalled();
  });
});

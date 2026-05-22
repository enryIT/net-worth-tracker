import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  createLocalAssistantThreadMock,
  listLocalAssistantThreadsMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  createLocalAssistantThreadMock: vi.fn(),
  listLocalAssistantThreadsMock: vi.fn(),
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
  createLocalAssistantThread: createLocalAssistantThreadMock,
  isAssistantStoreError: vi.fn(() => false),
  listLocalAssistantThreads: listLocalAssistantThreadsMock,
}));

import { GET, POST } from "@/app/api/ai/assistant/threads/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createRequest(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/ai/assistant/threads?userId=malicious-user", {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("local assistant threads route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    listLocalAssistantThreadsMock.mockResolvedValue([]);
    createLocalAssistantThreadMock.mockResolvedValue({
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
    });
  });

  it("lists threads for the authenticated local user", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(listLocalAssistantThreadsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({ threads: [] });
  });

  it("creates a thread for the authenticated local user and ignores body userId", async () => {
    const response = await POST(
      createRequest({
        userId: "malicious-user",
        mode: "month_analysis",
        pinnedMonth: { year: 2026, month: 5 },
      })
    );

    expect(response.status).toBe(200);
    expect(createLocalAssistantThreadMock).toHaveBeenCalledWith({
      userId: "user-1",
      mode: "month_analysis",
      pinnedMonth: { year: 2026, month: 5 },
      pinnedYear: null,
    });
  });

  it("rejects invalid create payloads", async () => {
    const response = await POST(
      createRequest({
        mode: "not-a-mode",
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalAssistantThreadMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(listLocalAssistantThreadsMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  requireUserSessionMock,
  sendLocalPeriodicEmailMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  sendLocalPeriodicEmailMock: vi.fn(),
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
  assertWritableUser: assertWritableUserMock,
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/email/localPeriodicEmailService", () => ({
  sendLocalPeriodicEmail: sendLocalPeriodicEmailMock,
}));

import { POST } from "@/app/api/user/monthly-email/send/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/user/monthly-email/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local periodic email route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    assertWritableUserMock.mockImplementation(() => undefined);
    sendLocalPeriodicEmailMock.mockResolvedValue({ status: "sent" });
  });

  it("sends the requested periodic email for the authenticated local user", async () => {
    const response = await POST(createRequest({ periodType: "quarterly" }));

    expect(response.status).toBe(200);
    expect(sendLocalPeriodicEmailMock).toHaveBeenCalledWith("user-1", "quarterly");
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("defaults to monthly when the period is omitted", async () => {
    const response = await POST(createRequest({}));

    expect(response.status).toBe(200);
    expect(sendLocalPeriodicEmailMock).toHaveBeenCalledWith("user-1", "monthly");
  });

  it("rejects invalid period types before sending", async () => {
    const response = await POST(createRequest({ periodType: "weekly" }));

    expect(response.status).toBe(400);
    expect(sendLocalPeriodicEmailMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(createRequest({ periodType: "monthly" }));

    expect(response.status).toBe(401);
    expect(sendLocalPeriodicEmailMock).not.toHaveBeenCalled();
  });

  it("returns 403 for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError("Non disponibile in modalita demo.", "DEMO_READONLY");
    });

    const response = await POST(createRequest({ periodType: "monthly" }));

    expect(response.status).toBe(403);
    expect(sendLocalPeriodicEmailMock).not.toHaveBeenCalled();
  });

  it("maps service rejections to the expected status", async () => {
    sendLocalPeriodicEmailMock.mockResolvedValue({
      status: "no_snapshot",
      error: "Nessuno snapshot trovato per il periodo richiesto: salva prima uno snapshot",
    });

    const response = await POST(createRequest({ periodType: "monthly" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Nessuno snapshot trovato per il periodo richiesto: salva prima uno snapshot",
    });
  });
});

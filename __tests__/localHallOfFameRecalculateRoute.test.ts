import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  requireUserSessionMock,
  updateLocalHallOfFameMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalHallOfFameMock: vi.fn(),
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

vi.mock("@/lib/server/hall-of-fame/localHallOfFameService", () => ({
  updateLocalHallOfFame: updateLocalHallOfFameMock,
}));

import { POST } from "@/app/api/hall-of-fame/recalculate/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("local hall of fame recalculate route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    updateLocalHallOfFameMock.mockResolvedValue(undefined);
  });

  it("recalculates Hall of Fame for the authenticated local user", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/hall-of-fame/recalculate", {
        method: "POST",
        body: JSON.stringify({ userId: "malicious-user" }),
      })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(updateLocalHallOfFameMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Hall of Fame ricalcolata correttamente.",
    });
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(
      new NextRequest("http://localhost/api/hall-of-fame/recalculate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    expect(updateLocalHallOfFameMock).not.toHaveBeenCalled();
  });

  it("returns 403 for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError("Non disponibile in modalita demo.", "DEMO_READONLY");
    });

    const response = await POST(
      new NextRequest("http://localhost/api/hall-of-fame/recalculate", {
        method: "POST",
      })
    );

    expect(response.status).toBe(403);
    expect(updateLocalHallOfFameMock).not.toHaveBeenCalled();
  });
});

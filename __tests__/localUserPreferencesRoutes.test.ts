import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  getLocalUserPreferencesMock,
  requireUserSessionMock,
  setLocalUserPreferencesMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  getLocalUserPreferencesMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  setLocalUserPreferencesMock: vi.fn(),
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

vi.mock("@/lib/server/settings/localUserPreferencesService", () => ({
  getLocalUserPreferences: getLocalUserPreferencesMock,
  setLocalUserPreferences: setLocalUserPreferencesMock,
}));

import {
  GET,
  PATCH,
} from "@/app/api/user/preferences/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/user/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local user preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns preferences for the authenticated user", async () => {
    getLocalUserPreferencesMock.mockResolvedValue({ colorTheme: "cyberpunk" });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLocalUserPreferencesMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      colorTheme: "cyberpunk",
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
  });

  it("updates preferences for writable users", async () => {
    setLocalUserPreferencesMock.mockResolvedValue(undefined);

    const response = await PATCH(
      createJsonRequest({ colorTheme: "solar-dusk" })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(setLocalUserPreferencesMock).toHaveBeenCalledWith("user-1", {
      colorTheme: "solar-dusk",
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects invalid color themes before reaching the service", async () => {
    const response = await PATCH(createJsonRequest({ colorTheme: "unknown" }));

    expect(response.status).toBe(400);
    expect(setLocalUserPreferencesMock).not.toHaveBeenCalled();
  });

  it("blocks preference writes for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await PATCH(createJsonRequest({ colorTheme: "default" }));

    expect(response.status).toBe(403);
    expect(setLocalUserPreferencesMock).not.toHaveBeenCalled();
  });
});

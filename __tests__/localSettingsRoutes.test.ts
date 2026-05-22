import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  getLocalSettingsMock,
  requireUserSessionMock,
  setLocalSettingsMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  getLocalSettingsMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  setLocalSettingsMock: vi.fn(),
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

vi.mock("@/lib/server/settings/localSettingsService", () => ({
  getLocalSettings: getLocalSettingsMock,
  setLocalSettings: setLocalSettingsMock,
}));

import { GET, PATCH } from "@/app/api/user/settings/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/user/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns settings for the authenticated user", async () => {
    getLocalSettingsMock.mockResolvedValue({ userAge: 42 });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLocalSettingsMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({ userAge: 42 });
  });

  it("returns null when settings are not initialized", async () => {
    getLocalSettingsMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(null);
  });

  it("updates settings for writable users", async () => {
    const response = await PATCH(
      createJsonRequest({
        userAge: 42,
        targets: {
          equity: { targetPercentage: 60 },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(setLocalSettingsMock).toHaveBeenCalledWith("user-1", {
      userAge: 42,
      targets: {
        equity: { targetPercentage: 60 },
      },
    });
  });

  it("rejects non-object settings payloads", async () => {
    const response = await PATCH(createJsonRequest(null));

    expect(response.status).toBe(400);
    expect(setLocalSettingsMock).not.toHaveBeenCalled();
  });

  it("blocks settings writes for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await PATCH(createJsonRequest({ userAge: 42 }));

    expect(response.status).toBe(403);
    expect(setLocalSettingsMock).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  exportUserDataMock,
  importUserDataMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  exportUserDataMock: vi.fn(),
  importUserDataMock: vi.fn(),
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
  assertWritableUser: assertWritableUserMock,
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/portability/appDataService", () => ({
  exportUserData: exportUserDataMock,
  importUserData: importUserDataMock,
}));

import { GET as exportRoute } from "@/app/api/data/export/route";
import { POST as importRoute } from "@/app/api/data/import/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/data/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app data portability routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("exports data for the authenticated user", async () => {
    exportUserDataMock.mockResolvedValue({
      version: 1,
      appVersion: "0.1.0",
      exportedAt: "2026-05-16T10:00:00.000Z",
      exportedUser: {
        id: "user-1",
        email: "test@example.com",
      },
      sections: {},
    });

    const response = await exportRoute();

    expect(response.status).toBe(200);
    expect(exportUserDataMock).toHaveBeenCalledWith(authenticatedUser);
    await expect(response.json()).resolves.toMatchObject({
      exportedUser: { id: "user-1" },
    });
  });

  it("returns 401 when exporting without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await exportRoute();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
  });

  it("imports data for writable authenticated users", async () => {
    importUserDataMock.mockResolvedValue({
      imported: 2,
      skipped: 1,
      failed: 0,
      errors: [],
    });
    const envelope = {
      version: 1,
      appVersion: "0.1.0",
      exportedAt: "2026-05-16T10:00:00.000Z",
      exportedUser: {
        id: "legacy-user",
        email: "legacy@example.com",
      },
      sections: {},
    };

    const response = await importRoute(createJsonRequest(envelope));

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(importUserDataMock).toHaveBeenCalledWith(authenticatedUser, envelope);
    await expect(response.json()).resolves.toEqual({
      imported: 2,
      skipped: 1,
      failed: 0,
      errors: [],
    });
  });

  it("blocks imports for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await importRoute(createJsonRequest({}));

    expect(response.status).toBe(403);
    expect(importUserDataMock).not.toHaveBeenCalled();
  });
});

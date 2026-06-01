import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const { requireUserSessionMock } = vi.hoisted(() => ({
  requireUserSessionMock: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  AuthSessionError: class AuthSessionError extends Error {
    constructor(
      message: string,
      public readonly code: "UNAUTHENTICATED" | "DEMO_READONLY"
    ) {
      super(message);
      this.name = "AuthSessionError";
    }
  },
  requireUserSession: requireUserSessionMock,
}));

import {
  assertResourceOwner,
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from "@/lib/server/apiAuth";
import { AuthSessionError } from "@/lib/server/auth/session";

function createRequest(): NextRequest {
  return new NextRequest("http://localhost/api/private", {
    method: "GET",
  });
}

describe("apiAuth local-session migration boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps apiAuth free from Firebase Admin runtime imports", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/server/apiAuth.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/from ['"]firebase-admin\/auth['"]/);
    expect(source).not.toMatch(/from ['"]@\/lib\/firebase\/admin['"]/);
    expect(source).not.toMatch(/\badminAuth\b/);
    expect(source).not.toMatch(/\bverifyIdToken\b/);
  });

  it("delegates requireFirebaseAuth to requireUserSession with uid-compatible payload", async () => {
    requireUserSessionMock.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "USER",
      isDemo: false,
    });

    const auth = await requireFirebaseAuth(createRequest());

    expect(requireUserSessionMock).toHaveBeenCalledOnce();
    expect(auth).toMatchObject({
      uid: "user-1",
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("maps missing local session errors through getApiAuthErrorResponse as 401 JSON", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    let thrownError: unknown;
    try {
      await requireFirebaseAuth(createRequest());
    } catch (error) {
      thrownError = error;
    }

    const response = getApiAuthErrorResponse(thrownError);

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
  });

  it("enforces same-user checks and preserves 400/403 auth response mapping", async () => {
    const decodedToken = { uid: "user-1" } as Awaited<
      ReturnType<typeof requireFirebaseAuth>
    >;

    let missingUserIdResponse = null;
    try {
      assertSameUser(decodedToken, undefined);
    } catch (error) {
      missingUserIdResponse = getApiAuthErrorResponse(error);
    }

    expect(missingUserIdResponse?.status).toBe(400);
    await expect(missingUserIdResponse?.json()).resolves.toEqual({
      error: "User ID is required",
    });

    let mismatchedUserResponse = null;
    try {
      assertSameUser(decodedToken, "user-2");
    } catch (error) {
      mismatchedUserResponse = getApiAuthErrorResponse(error);
    }

    expect(mismatchedUserResponse?.status).toBe(403);
    await expect(mismatchedUserResponse?.json()).resolves.toEqual({
      error: "Authenticated user does not match requested user",
    });
  });

  it("enforces resource ownership checks and preserves 403 auth response mapping", async () => {
    const decodedToken = { uid: "user-1" } as Awaited<
      ReturnType<typeof requireFirebaseAuth>
    >;

    let missingOwnerResponse = null;
    try {
      assertResourceOwner(decodedToken, undefined);
    } catch (error) {
      missingOwnerResponse = getApiAuthErrorResponse(error);
    }

    expect(missingOwnerResponse?.status).toBe(403);
    await expect(missingOwnerResponse?.json()).resolves.toEqual({
      error: "Resource owner is missing",
    });

    let mismatchedOwnerResponse = null;
    try {
      assertResourceOwner(decodedToken, "user-2");
    } catch (error) {
      mismatchedOwnerResponse = getApiAuthErrorResponse(error);
    }

    expect(mismatchedOwnerResponse?.status).toBe(403);
    await expect(mismatchedOwnerResponse?.json()).resolves.toEqual({
      error: "Resource does not belong to authenticated user",
    });
  });
});

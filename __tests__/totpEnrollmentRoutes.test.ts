import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  confirmTotpEnrollmentMock,
  requireUserSessionMock,
  startTotpEnrollmentMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  confirmTotpEnrollmentMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  startTotpEnrollmentMock: vi.fn(),
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

vi.mock("@/lib/server/auth/totpEnrollmentService", () => ({
  TotpEnrollmentError: class TotpEnrollmentError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = "TotpEnrollmentError";
    }
  },
  confirmTotpEnrollment: confirmTotpEnrollmentMock,
  startTotpEnrollment: startTotpEnrollmentMock,
}));

import {
  POST as confirmRoute,
} from "@/app/api/auth/local/totp/confirm/route";
import { POST as startRoute } from "@/app/api/auth/local/totp/start/route";
import { TotpEnrollmentError } from "@/lib/server/auth/totpEnrollmentService";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/local/totp/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("TOTP enrollment routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("starts TOTP enrollment for writable users", async () => {
    startTotpEnrollmentMock.mockResolvedValue({
      secret: "secret",
      provisioningUri: "otpauth://totp/test",
    });

    const response = await startRoute();

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(startTotpEnrollmentMock).toHaveBeenCalledWith(authenticatedUser);
    await expect(response.json()).resolves.toEqual({
      secret: "secret",
      provisioningUri: "otpauth://totp/test",
    });
  });

  it("confirms TOTP enrollment", async () => {
    confirmTotpEnrollmentMock.mockResolvedValue({
      recoveryCodes: ["code-1"],
    });

    const response = await confirmRoute(createJsonRequest({ token: "123456" }));

    expect(response.status).toBe(200);
    expect(confirmTotpEnrollmentMock).toHaveBeenCalledWith(
      authenticatedUser,
      "123456"
    );
    await expect(response.json()).resolves.toEqual({
      recoveryCodes: ["code-1"],
    });
  });

  it("rejects invalid confirm payloads", async () => {
    const response = await confirmRoute(createJsonRequest({ token: "123" }));

    expect(response.status).toBe(400);
    expect(confirmTotpEnrollmentMock).not.toHaveBeenCalled();
  });

  it("maps invalid TOTP confirmation errors to 400", async () => {
    confirmTotpEnrollmentMock.mockRejectedValue(
      new TotpEnrollmentError("Codice 2FA non valido.", "INVALID_TOTP")
    );

    const response = await confirmRoute(createJsonRequest({ token: "123456" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Codice 2FA non valido.",
    });
  });
});

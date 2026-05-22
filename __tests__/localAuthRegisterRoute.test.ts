import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const { registerLocalUserMock } = vi.hoisted(() => ({
  registerLocalUserMock: vi.fn(),
}));

vi.mock("@/lib/server/auth/localAuthService", () => {
  class LocalAuthError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = "LocalAuthError";
    }
  }

  return {
    LocalAuthError,
    registerLocalUser: registerLocalUserMock,
  };
});

import { POST } from "@/app/api/auth/local/register/route";
import { LocalAuthError } from "@/lib/server/auth/localAuthService";

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/local/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local auth registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a local user", async () => {
    registerLocalUserMock.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: UserRole.USER,
      isDemo: false,
    });

    const response = await POST(
      createJsonRequest({
        email: "test@example.com",
        password: "very-secure-password",
        name: "Test User",
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: UserRole.USER,
        isDemo: false,
      },
    });
  });

  it("rejects invalid request bodies", async () => {
    const response = await POST(createJsonRequest({ email: "test@example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Email e password sono obbligatorie.",
    });
    expect(registerLocalUserMock).not.toHaveBeenCalled();
  });

  it("rejects malformed emails before reaching the service", async () => {
    const response = await POST(
      createJsonRequest({
        email: "not-an-email",
        password: "very-secure-password",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Inserisci un indirizzo email valido.",
    });
    expect(registerLocalUserMock).not.toHaveBeenCalled();
  });

  it("rejects short passwords before reaching the service", async () => {
    const response = await POST(
      createJsonRequest({
        email: "test@example.com",
        password: "short",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "La password deve contenere almeno 10 caratteri.",
    });
    expect(registerLocalUserMock).not.toHaveBeenCalled();
  });

  it("maps blocked registrations to 403", async () => {
    registerLocalUserMock.mockRejectedValue(
      new LocalAuthError("Registrazione bloccata.", "REGISTRATION_BLOCKED")
    );

    const response = await POST(
      createJsonRequest({
        email: "test@example.com",
        password: "very-secure-password",
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Registrazione bloccata.",
    });
  });

  it("maps duplicate users to 409", async () => {
    registerLocalUserMock.mockRejectedValue(
      new LocalAuthError("Esiste gia un account con questa email.", "USER_EXISTS")
    );

    const response = await POST(
      createJsonRequest({
        email: "test@example.com",
        password: "very-secure-password",
      })
    );

    expect(response.status).toBe(409);
  });
});

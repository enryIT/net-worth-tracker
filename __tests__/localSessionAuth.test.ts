import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@/lib/server/auth/nextAuthOptions", () => ({
  authOptions: { providers: [] },
}));

import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";

describe("local session auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the authenticated local user from the server session", async () => {
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: UserRole.USER,
        isDemo: false,
      },
    });

    await expect(requireUserSession()).resolves.toEqual({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: UserRole.USER,
      isDemo: false,
    });
  });

  it("throws an auth error when the session is missing", async () => {
    getServerSessionMock.mockResolvedValue(null);

    await expect(requireUserSession()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    } satisfies Partial<AuthSessionError>);
  });

  it("blocks writes for demo users", () => {
    expect(() =>
      assertWritableUser({
        id: "demo-user",
        email: "demo@example.com",
        name: "Demo",
        role: UserRole.USER,
        isDemo: true,
      })
    ).toThrowError(
      expect.objectContaining({
        code: "DEMO_READONLY",
      })
    );
  });
});

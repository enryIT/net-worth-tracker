import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const { prismaMock, verifyTotpTokenMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    loginEvent: {
      create: vi.fn(),
    },
    recoveryCode: {
      update: vi.fn(),
    },
  },
  verifyTotpTokenMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/server/auth/totp", () => ({
  verifyTotpToken: verifyTotpTokenMock,
}));

import { hashPassword } from "@/lib/server/auth/password";
import {
  authorizeLocalCredentials,
  LocalAuthError,
  registerLocalUser,
} from "@/lib/server/auth/localAuthService";

describe("local auth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.REGISTRATIONS_ENABLED = "true";
    process.env.REGISTRATION_WHITELIST_ENABLED = "false";
    process.env.REGISTRATION_WHITELIST = "";
  });

  it("registers a local user with a hashed password and audit event", async () => {
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: UserRole.USER,
      isDemo: false,
    });

    const user = await registerLocalUser({
      email: " Test@Example.com ",
      password: "very-secure-password",
      name: " Test User ",
    });

    expect(user).toEqual({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: UserRole.USER,
      isDemo: false,
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: {
        email: "test@example.com",
        name: "Test User",
        passwordCredential: {
          create: {
            passwordHash: expect.any(String),
          },
        },
      },
    });
    const passwordHash =
      prismaMock.user.create.mock.calls[0][0].data.passwordCredential.create
        .passwordHash;
    expect(passwordHash).not.toBe("very-secure-password");
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        actorUserId: "user-1",
        action: "CREATE",
        entityType: "user",
        entityId: "user-1",
        metadata: { source: "local-registration" },
      },
    });
  });

  it("blocks local registration when the server policy denies it", async () => {
    process.env.REGISTRATIONS_ENABLED = "false";

    await expect(
      registerLocalUser({
        email: "test@example.com",
        password: "very-secure-password",
      })
    ).rejects.toMatchObject({
      code: "REGISTRATION_BLOCKED",
    } satisfies Partial<LocalAuthError>);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("authorizes valid password credentials without 2FA", async () => {
    const passwordHash = await hashPassword("very-secure-password");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: UserRole.USER,
      isDemo: false,
      passwordCredential: { passwordHash },
      totpCredential: null,
      recoveryCodes: [],
    });

    const user = await authorizeLocalCredentials({
      email: "TEST@example.com",
      password: "very-secure-password",
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });

    expect(user.id).toBe("user-1");
    expect(prismaMock.loginEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        email: "test@example.com",
        type: "LOGIN_SUCCESS",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        metadata: undefined,
      },
    });
  });

  it("requires a TOTP token when 2FA is confirmed", async () => {
    const passwordHash = await hashPassword("very-secure-password");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: null,
      role: UserRole.USER,
      isDemo: false,
      passwordCredential: { passwordHash },
      totpCredential: {
        encryptedSecret: "secret",
        confirmedAt: new Date("2026-05-16T00:00:00.000Z"),
        disabledAt: null,
      },
      recoveryCodes: [],
    });

    await expect(
      authorizeLocalCredentials({
        email: "test@example.com",
        password: "very-secure-password",
      })
    ).rejects.toMatchObject({
      code: "TOTP_REQUIRED",
    } satisfies Partial<LocalAuthError>);
    expect(prismaMock.loginEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        email: "test@example.com",
        type: "TOTP_CHALLENGE",
        ipAddress: undefined,
        userAgent: undefined,
        metadata: undefined,
      },
    });
  });

  it("accepts a valid TOTP token", async () => {
    const passwordHash = await hashPassword("very-secure-password");
    verifyTotpTokenMock.mockReturnValue(true);
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: null,
      role: UserRole.USER,
      isDemo: false,
      passwordCredential: { passwordHash },
      totpCredential: {
        encryptedSecret: "secret",
        confirmedAt: new Date("2026-05-16T00:00:00.000Z"),
        disabledAt: null,
      },
      recoveryCodes: [],
    });

    const user = await authorizeLocalCredentials({
      email: "test@example.com",
      password: "very-secure-password",
      totpCode: "123456",
    });

    expect(user.id).toBe("user-1");
    expect(verifyTotpTokenMock).toHaveBeenCalledWith({
      secret: "secret",
      token: "123456",
    });
  });

  it("marks a matching recovery code as used", async () => {
    const passwordHash = await hashPassword("very-secure-password");
    const recoveryCodeHash = await hashPassword("backup-code");
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      name: null,
      role: UserRole.USER,
      isDemo: false,
      passwordCredential: { passwordHash },
      totpCredential: {
        encryptedSecret: "secret",
        confirmedAt: new Date("2026-05-16T00:00:00.000Z"),
        disabledAt: null,
      },
      recoveryCodes: [{ id: "recovery-1", codeHash: recoveryCodeHash }],
    });

    await authorizeLocalCredentials({
      email: "test@example.com",
      password: "very-secure-password",
      recoveryCode: "backup-code",
    });

    expect(prismaMock.recoveryCode.update).toHaveBeenCalledWith({
      where: { id: "recovery-1" },
      data: { usedAt: expect.any(Date) },
    });
  });
});

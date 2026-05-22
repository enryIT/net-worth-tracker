import "server-only";

import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/auth/password";
import { verifyTotpToken } from "@/lib/server/auth/totp";
import { isLocalRegistrationAllowed } from "@/lib/server/auth/registrationPolicy";

export class LocalAuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_CREDENTIALS"
      | "REGISTRATION_BLOCKED"
      | "USER_EXISTS"
      | "TOTP_REQUIRED"
      | "INVALID_TOTP"
      | "INVALID_RECOVERY_CODE"
  ) {
    super(message);
    this.name = "LocalAuthError";
  }
}

export type LocalAuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isDemo: boolean;
};

export type RegisterLocalUserInput = {
  email: string;
  password: string;
  name?: string;
};

export type AuthorizeLocalCredentialsInput = {
  email: string;
  password: string;
  totpCode?: string;
  recoveryCode?: string;
  ipAddress?: string;
  userAgent?: string;
};

const MIN_PASSWORD_LENGTH = 10;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toLocalAuthUser(user: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isDemo: boolean;
}): LocalAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isDemo: user.isDemo,
  };
}

async function recordLoginEvent(params: {
  userId?: string;
  email?: string;
  type:
    | "LOGIN_SUCCESS"
    | "LOGIN_FAILURE"
    | "TOTP_CHALLENGE"
    | "RECOVERY_CODE_USED";
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.loginEvent.create({
    data: {
      userId: params.userId,
      email: params.email,
      type: params.type,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: params.metadata,
    },
  });
}

export async function registerLocalUser(
  input: RegisterLocalUserInput
): Promise<LocalAuthUser> {
  const email = normalizeEmail(input.email);
  const policy = isLocalRegistrationAllowed(email);

  if (!policy.allowed) {
    throw new LocalAuthError(policy.message, "REGISTRATION_BLOCKED");
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new LocalAuthError(
      "La password deve contenere almeno 10 caratteri.",
      "INVALID_CREDENTIALS"
    );
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        passwordCredential: {
          create: {
            passwordHash,
          },
        },
      },
    });

    await prisma.auditEvent.create({
      data: {
        userId: user.id,
        actorUserId: user.id,
        action: "CREATE",
        entityType: "user",
        entityId: user.id,
        metadata: { source: "local-registration" },
      },
    });

    return toLocalAuthUser(user);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new LocalAuthError(
        "Esiste gia un account con questa email.",
        "USER_EXISTS"
      );
    }

    throw error;
  }
}

export async function authorizeLocalCredentials(
  input: AuthorizeLocalCredentialsInput
): Promise<LocalAuthUser> {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      passwordCredential: true,
      totpCredential: true,
      recoveryCodes: {
        where: { usedAt: null },
      },
    },
  });

  if (!user?.passwordCredential) {
    await recordLoginEvent({
      email,
      type: "LOGIN_FAILURE",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { reason: "missing-user-or-password" },
    });
    throw new LocalAuthError("Credenziali non valide.", "INVALID_CREDENTIALS");
  }

  const passwordMatches = await verifyPassword(
    user.passwordCredential.passwordHash,
    input.password
  );

  if (!passwordMatches) {
    await recordLoginEvent({
      userId: user.id,
      email,
      type: "LOGIN_FAILURE",
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { reason: "invalid-password" },
    });
    throw new LocalAuthError("Credenziali non valide.", "INVALID_CREDENTIALS");
  }

  const activeTotp = user.totpCredential?.confirmedAt
    ? user.totpCredential
    : null;

  if (activeTotp && !activeTotp.disabledAt) {
    if (input.recoveryCode) {
      const matchingRecoveryCode = await findMatchingRecoveryCode(
        user.recoveryCodes,
        input.recoveryCode
      );

      if (!matchingRecoveryCode) {
        await recordLoginEvent({
          userId: user.id,
          email,
          type: "LOGIN_FAILURE",
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: { reason: "invalid-recovery-code" },
        });
        throw new LocalAuthError(
          "Codice di recupero non valido.",
          "INVALID_RECOVERY_CODE"
        );
      }

      await prisma.recoveryCode.update({
        where: { id: matchingRecoveryCode.id },
        data: { usedAt: new Date() },
      });
      await recordLoginEvent({
        userId: user.id,
        email,
        type: "RECOVERY_CODE_USED",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } else if (!input.totpCode) {
      await recordLoginEvent({
        userId: user.id,
        email,
        type: "TOTP_CHALLENGE",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      throw new LocalAuthError("Codice 2FA richiesto.", "TOTP_REQUIRED");
    } else if (
      !verifyTotpToken({
        secret: activeTotp.encryptedSecret,
        token: input.totpCode,
      })
    ) {
      await recordLoginEvent({
        userId: user.id,
        email,
        type: "LOGIN_FAILURE",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: { reason: "invalid-totp" },
      });
      throw new LocalAuthError("Codice 2FA non valido.", "INVALID_TOTP");
    }
  }

  await recordLoginEvent({
    userId: user.id,
    email,
    type: "LOGIN_SUCCESS",
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return toLocalAuthUser(user);
}

async function findMatchingRecoveryCode(
  recoveryCodes: Array<{ id: string; codeHash: string }>,
  code: string
): Promise<{ id: string } | null> {
  for (const recoveryCode of recoveryCodes) {
    if (await verifyPassword(recoveryCode.codeHash, code)) {
      return { id: recoveryCode.id };
    }
  }

  return null;
}

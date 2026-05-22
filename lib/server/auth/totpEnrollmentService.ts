import "server-only";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/server/prisma";
import type { AuthenticatedUser } from "@/lib/server/auth/session";
import { hashPassword } from "@/lib/server/auth/password";
import {
  generateTotpSecret,
  getTotpProvisioningUri,
  verifyTotpToken,
} from "@/lib/server/auth/totp";

export class TotpEnrollmentError extends Error {
  constructor(
    message: string,
    public readonly code: "TOTP_NOT_STARTED" | "INVALID_TOTP"
  ) {
    super(message);
    this.name = "TotpEnrollmentError";
  }
}

export type StartTotpEnrollmentResult = {
  secret: string;
  provisioningUri: string;
};

export type ConfirmTotpEnrollmentResult = {
  recoveryCodes: string[];
};

export async function startTotpEnrollment(
  user: AuthenticatedUser
): Promise<StartTotpEnrollmentResult> {
  const secret = generateTotpSecret();
  const provisioningUri = getTotpProvisioningUri({
    email: user.email ?? user.id,
    secret,
  });

  await prisma.totpCredential.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      encryptedSecret: secret,
    },
    update: {
      encryptedSecret: secret,
      confirmedAt: null,
      disabledAt: null,
    },
  });

  return { secret, provisioningUri };
}

export async function confirmTotpEnrollment(
  user: AuthenticatedUser,
  token: string
): Promise<ConfirmTotpEnrollmentResult> {
  const credential = await prisma.totpCredential.findUnique({
    where: { userId: user.id },
  });

  if (!credential || credential.disabledAt) {
    throw new TotpEnrollmentError(
      "Configurazione 2FA non avviata.",
      "TOTP_NOT_STARTED"
    );
  }

  if (
    !verifyTotpToken({
      secret: credential.encryptedSecret,
      token,
    })
  ) {
    throw new TotpEnrollmentError("Codice 2FA non valido.", "INVALID_TOTP");
  }

  const recoveryCodes = generateRecoveryCodes(10);
  const recoveryCodeRows = await Promise.all(
    recoveryCodes.map(async (code) => ({
      userId: user.id,
      codeHash: await hashPassword(code),
    }))
  );

  await prisma.totpCredential.update({
    where: { userId: user.id },
    data: { confirmedAt: new Date(), disabledAt: null },
  });
  await prisma.recoveryCode.deleteMany({
    where: { userId: user.id, usedAt: null },
  });
  await prisma.recoveryCode.createMany({
    data: recoveryCodeRows,
  });
  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      actorUserId: user.id,
      action: "SECURITY",
      entityType: "totp",
      entityId: user.id,
      metadata: { action: "totp-enabled" },
    },
  });

  return { recoveryCodes };
}

function generateRecoveryCodes(count: number): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(9).toString("base64url")
  );
}

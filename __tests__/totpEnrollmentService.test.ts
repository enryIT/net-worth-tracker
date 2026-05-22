import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const { prismaMock, generateTotpSecretMock, getTotpProvisioningUriMock, verifyTotpTokenMock } =
  vi.hoisted(() => ({
    prismaMock: {
      totpCredential: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      recoveryCode: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      auditEvent: {
        create: vi.fn(),
      },
    },
    generateTotpSecretMock: vi.fn(),
    getTotpProvisioningUriMock: vi.fn(),
    verifyTotpTokenMock: vi.fn(),
  }));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/server/auth/totp", () => ({
  generateTotpSecret: generateTotpSecretMock,
  getTotpProvisioningUri: getTotpProvisioningUriMock,
  verifyTotpToken: verifyTotpTokenMock,
}));

import {
  confirmTotpEnrollment,
  startTotpEnrollment,
  TotpEnrollmentError,
} from "@/lib/server/auth/totpEnrollmentService";

const user = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("TOTP enrollment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateTotpSecretMock.mockReturnValue("secret");
    getTotpProvisioningUriMock.mockReturnValue("otpauth://totp/test");
  });

  it("starts enrollment by storing an unconfirmed secret", async () => {
    const result = await startTotpEnrollment(user);

    expect(result).toEqual({
      secret: "secret",
      provisioningUri: "otpauth://totp/test",
    });
    expect(prismaMock.totpCredential.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        encryptedSecret: "secret",
      },
      update: {
        encryptedSecret: "secret",
        confirmedAt: null,
        disabledAt: null,
      },
    });
  });

  it("rejects confirmation when no pending secret exists", async () => {
    prismaMock.totpCredential.findUnique.mockResolvedValue(null);

    await expect(
      confirmTotpEnrollment(user, "123456")
    ).rejects.toMatchObject({
      code: "TOTP_NOT_STARTED",
    } satisfies Partial<TotpEnrollmentError>);
  });

  it("rejects invalid confirmation codes", async () => {
    prismaMock.totpCredential.findUnique.mockResolvedValue({
      encryptedSecret: "secret",
      disabledAt: null,
    });
    verifyTotpTokenMock.mockReturnValue(false);

    await expect(
      confirmTotpEnrollment(user, "123456")
    ).rejects.toMatchObject({
      code: "INVALID_TOTP",
    } satisfies Partial<TotpEnrollmentError>);
    expect(prismaMock.recoveryCode.createMany).not.toHaveBeenCalled();
  });

  it("confirms TOTP and rotates recovery codes", async () => {
    prismaMock.totpCredential.findUnique.mockResolvedValue({
      encryptedSecret: "secret",
      disabledAt: null,
    });
    verifyTotpTokenMock.mockReturnValue(true);

    const result = await confirmTotpEnrollment(user, "123456");

    expect(result.recoveryCodes).toHaveLength(10);
    expect(prismaMock.totpCredential.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { confirmedAt: expect.any(Date), disabledAt: null },
    });
    expect(prismaMock.recoveryCode.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", usedAt: null },
    });
    expect(prismaMock.recoveryCode.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: "user-1",
          codeHash: expect.any(String),
        }),
      ]),
    });
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        actorUserId: "user-1",
        action: "SECURITY",
        entityType: "totp",
        entityId: "user-1",
        metadata: { action: "totp-enabled" },
      },
    });
  });
});

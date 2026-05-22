import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    appSetting: {
      findMany: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  exportUserData,
  importUserData,
} from "@/lib/server/portability/appDataService";

const user = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("app data service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports user-scoped app settings", async () => {
    prismaMock.appSetting.findMany.mockResolvedValue([
      {
        key: "user:user-1:theme",
        value: { theme: "default" },
        updatedAt: new Date("2026-05-16T10:00:00.000Z"),
      },
    ]);

    const envelope = await exportUserData(user);

    expect(prismaMock.appSetting.findMany).toHaveBeenCalledWith({
      where: {
        key: {
          startsWith: "user:user-1:",
        },
      },
      orderBy: { key: "asc" },
    });
    expect(envelope.exportedUser).toEqual({
      id: "user-1",
      email: "test@example.com",
    });
    expect(envelope.sections.appSettings).toEqual([
      {
        key: "user:user-1:theme",
        value: { theme: "default" },
        updatedAt: "2026-05-16T10:00:00.000Z",
      },
    ]);
  });

  it("returns validation errors for invalid imports without writing audit events", async () => {
    const result = await importUserData(user, {
      version: 999,
      sections: {},
    });

    expect(result.failed).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(prismaMock.auditEvent.create).not.toHaveBeenCalled();
  });

  it("records an audit event for valid import envelopes", async () => {
    const result = await importUserData(user, {
      version: 1,
      appVersion: "0.1.0",
      exportedAt: "2026-05-16T10:00:00.000Z",
      exportedUser: {
        id: "legacy-user",
        email: "legacy@example.com",
      },
      sections: {
        assets: [],
        settings: [],
      },
    });

    expect(result).toEqual({
      imported: 0,
      skipped: 2,
      failed: 0,
      errors: [],
    });
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        actorUserId: "user-1",
        action: "IMPORT",
        entityType: "app-data-export",
        metadata: {
          exportVersion: 1,
          sourceUserId: "legacy-user",
        },
      },
    });
  });
});

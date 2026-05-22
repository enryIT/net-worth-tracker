import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEventAction } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  getLocalSettingsMock,
  prismaMock,
  setLocalSettingsMock,
} = vi.hoisted(() => ({
  getLocalSettingsMock: vi.fn(),
  prismaMock: {
    auditEvent: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
  setLocalSettingsMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/server/settings/localSettingsService", () => ({
  getLocalSettings: getLocalSettingsMock,
  setLocalSettings: setLocalSettingsMock,
}));

import {
  appendLocalHouseholdAuditEntry,
  getLocalHouseholdAuditEntries,
  getLocalHouseholdConfig,
  saveLocalHouseholdConfig,
} from "@/lib/server/household/localHouseholdService";
import { getDefaultHouseholdConfig } from "@/lib/utils/householdUtils";

describe("local household service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the default household config when settings are missing", async () => {
    getLocalSettingsMock.mockResolvedValue(null);

    await expect(getLocalHouseholdConfig("user-1")).resolves.toEqual(
      getDefaultHouseholdConfig("user-1")
    );
  });

  it("returns stored household config merged with safe defaults", async () => {
    getLocalSettingsMock.mockResolvedValue({
      householdConfig: {
        enabled: true,
        participants: [
          { id: "self", name: "Io", role: "self", sortOrder: 0, active: true },
        ],
      },
    });

    const config = await getLocalHouseholdConfig("user-1");

    expect(config).toMatchObject({
      userId: "user-1",
      enabled: true,
      participants: [
        { id: "self", name: "Io", role: "self", sortOrder: 0, active: true },
      ],
    });
    expect(config.profiles.length).toBeGreaterThan(0);
  });

  it("saves household config into local settings and records an audit event", async () => {
    const config = {
      ...getDefaultHouseholdConfig("user-1"),
      enabled: true,
    };

    await saveLocalHouseholdConfig("user-1", config);

    expect(setLocalSettingsMock).toHaveBeenCalledWith("user-1", {
      householdConfig: expect.objectContaining({
        userId: "user-1",
        enabled: true,
      }),
    });
    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        actorUserId: "user-1",
        action: AuditEventAction.UPDATE,
        entityType: "householdConfig",
        entityId: "user-1",
        metadata: expect.objectContaining({
          summary: "Configurazione household aggiornata",
          after: {
            participants: config.participants.length,
            profiles: config.profiles.length,
            attributionRules: config.attributionRules.length,
          },
        }),
      },
    });
  });

  it("appends and lists household audit entries from local audit events", async () => {
    prismaMock.auditEvent.create.mockResolvedValue({
      id: "audit-1",
      userId: "user-1",
      action: AuditEventAction.CREATE,
      entityType: "asset",
      entityId: "asset-1",
      metadata: {
        householdAction: "create",
        summary: "Asset creato",
        before: null,
        after: { name: "Conto" },
      },
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
    });
    prismaMock.auditEvent.findMany.mockResolvedValue([
      {
        id: "audit-1",
        userId: "user-1",
        action: AuditEventAction.CREATE,
        entityType: "asset",
        entityId: "asset-1",
        metadata: {
          householdAction: "create",
          summary: "Asset creato",
          before: null,
          after: { name: "Conto" },
        },
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      },
    ]);

    await appendLocalHouseholdAuditEntry("user-1", {
      entityType: "asset",
      entityId: "asset-1",
      action: "create",
      summary: "Asset creato",
      after: { name: "Conto" },
    });

    expect(prismaMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        actorUserId: "user-1",
        action: AuditEventAction.CREATE,
        entityType: "asset",
        entityId: "asset-1",
        metadata: {
          householdAudit: true,
          householdAction: "create",
          summary: "Asset creato",
          before: undefined,
          after: { name: "Conto" },
        },
      },
    });

    await expect(getLocalHouseholdAuditEntries("user-1", 10)).resolves.toEqual([
      {
        id: "audit-1",
        userId: "user-1",
        entityType: "asset",
        entityId: "asset-1",
        action: "create",
        summary: "Asset creato",
        before: null,
        after: { name: "Conto" },
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      },
    ]);
    expect(prismaMock.auditEvent.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        metadata: {
          path: ["householdAudit"],
          equals: true,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  });
});

import "server-only";

import { AuditEventAction, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  getLocalSettings,
  setLocalSettings,
} from "@/lib/server/settings/localSettingsService";
import type {
  HouseholdAuditAction,
  HouseholdAuditEntry,
  HouseholdConfig,
} from "@/types/household";
import { getDefaultHouseholdConfig } from "@/lib/utils/householdUtils";

type HouseholdAuditInput = Omit<
  HouseholdAuditEntry,
  "id" | "userId" | "createdAt"
>;

type AuditRow = {
  id: string;
  userId: string | null;
  action: AuditEventAction;
  entityType: string;
  entityId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export async function getLocalHouseholdConfig(
  userId: string
): Promise<HouseholdConfig> {
  const fallback = getDefaultHouseholdConfig(userId);
  const settings = await getLocalSettings(userId);
  const householdConfig = isRecord(settings) ? settings.householdConfig : null;

  if (!isRecord(householdConfig)) {
    return fallback;
  }

  const data = householdConfig as Partial<HouseholdConfig>;
  return {
    ...fallback,
    ...data,
    userId,
    participants: data.participants?.length
      ? data.participants
      : fallback.participants,
    profiles: data.profiles?.length ? data.profiles : fallback.profiles,
    attributionRules: data.attributionRules ?? fallback.attributionRules,
  };
}

export async function saveLocalHouseholdConfig(
  userId: string,
  config: HouseholdConfig
): Promise<void> {
  const now = new Date().toISOString();
  await setLocalSettings(userId, {
    householdConfig: {
      ...config,
      userId,
      updatedAt: now,
      createdAt: config.createdAt ? toJsonValue(config.createdAt) : now,
    },
  });

  await appendLocalHouseholdAuditEntry(userId, {
    entityType: "householdConfig",
    entityId: userId,
    action: "update",
    summary: "Configurazione household aggiornata",
    after: {
      participants: config.participants.length,
      profiles: config.profiles.length,
      attributionRules: config.attributionRules.length,
    },
  });
}

export async function appendLocalHouseholdAuditEntry(
  userId: string,
  entry: HouseholdAuditInput
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      userId,
      actorUserId: userId,
      action: mapHouseholdAuditAction(entry.action),
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: stripUndefined({
        householdAudit: true,
        householdAction: entry.action,
        summary: entry.summary,
        before: toJsonValue(entry.before),
        after: toJsonValue(entry.after),
      }),
    },
  });
}

export function appendLocalHouseholdAuditEntrySafe(
  userId: string | undefined,
  entry: HouseholdAuditInput
): void {
  if (!userId) return;

  appendLocalHouseholdAuditEntry(userId, entry).catch((error) => {
    console.warn("Unable to append household audit entry", {
      userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function getLocalHouseholdAuditEntries(
  userId: string,
  maxCount = 100
): Promise<HouseholdAuditEntry[]> {
  const rows = await prisma.auditEvent.findMany({
    where: {
      userId,
      metadata: {
        path: ["householdAudit"],
        equals: true,
      },
    },
    orderBy: { createdAt: "desc" },
    take: maxCount,
  });

  return rows.map(mapAuditRow);
}

function mapHouseholdAuditAction(action: HouseholdAuditAction): AuditEventAction {
  if (action === "create") return AuditEventAction.CREATE;
  if (action === "delete") return AuditEventAction.DELETE;
  return AuditEventAction.UPDATE;
}

function mapAuditRow(row: AuditRow): HouseholdAuditEntry {
  const metadata = isRecord(row.metadata) ? row.metadata : {};

  return {
    id: row.id,
    userId: row.userId ?? "",
    entityType: row.entityType as HouseholdAuditEntry["entityType"],
    entityId: row.entityId ?? "",
    action: (metadata.householdAction ?? "update") as HouseholdAuditAction,
    summary: typeof metadata.summary === "string" ? metadata.summary : "",
    before: metadata.before,
    after: metadata.after,
    createdAt: row.createdAt,
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function toJsonValue(input: unknown): Prisma.InputJsonValue | undefined {
  if (input === undefined) return undefined;
  return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
}

function stripUndefined(input: Record<string, unknown>): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Prisma.InputJsonObject;
}

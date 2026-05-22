import "server-only";

import { prisma } from "@/lib/server/prisma";
import type { AuthenticatedUser } from "@/lib/server/auth/session";
import {
  type AppDataExportEnvelope,
  buildExportEnvelope,
  parseImportEnvelope,
} from "@/lib/server/portability/appDataExport";

export type AppDataImportSummary = {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function exportUserData(
  user: AuthenticatedUser
): Promise<AppDataExportEnvelope> {
  const appVersion = process.env.npm_package_version ?? "0.1.0";
  const preferences = await prisma.appSetting.findMany({
    where: {
      key: {
        startsWith: `user:${user.id}:`,
      },
    },
    orderBy: { key: "asc" },
  });

  return buildExportEnvelope({
    appVersion,
    exportedAt: new Date(),
    exportedUser: {
      id: user.id,
      email: user.email ?? "unknown@example.com",
    },
    sections: {
      appSettings: preferences.map((setting) => ({
        key: setting.key,
        value: setting.value,
        updatedAt: setting.updatedAt.toISOString(),
      })),
    },
  });
}

export async function importUserData(
  user: AuthenticatedUser,
  input: unknown
): Promise<AppDataImportSummary> {
  const parsed = parseImportEnvelope(input);

  if (!parsed.success) {
    return {
      imported: 0,
      skipped: 0,
      failed: 1,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  await prisma.auditEvent.create({
    data: {
      userId: user.id,
      actorUserId: user.id,
      action: "IMPORT",
      entityType: "app-data-export",
      metadata: {
        exportVersion: parsed.data.version,
        sourceUserId: parsed.data.exportedUser.id,
      },
    },
  });

  return {
    imported: 0,
    skipped: Object.keys(parsed.data.sections).length,
    failed: 0,
    errors: [],
  };
}

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type { AssetAllocationSettings } from "@/types/assets";

export async function getLocalSettings(
  userId: string
): Promise<AssetAllocationSettings | null> {
  const row = await prisma.userSetting.findUnique({
    where: { userId },
  });

  if (!row) {
    return null;
  }

  return row.data as unknown as AssetAllocationSettings;
}

export async function setLocalSettings(
  userId: string,
  settings: Record<string, unknown>
): Promise<void> {
  const existing = await prisma.userSetting.findUnique({
    where: { userId },
  });
  const existingData = existing?.data && isRecord(existing.data)
    ? existing.data
    : {};
  const mergedSettings = {
    ...existingData,
    ...stripUndefined(settings),
  };

  await prisma.userSetting.upsert({
    where: { userId },
    create: {
      userId,
      data: stripUndefined(settings) as Prisma.InputJsonValue,
    },
    update: {
      data: mergedSettings as Prisma.InputJsonValue,
    },
  });
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  );
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

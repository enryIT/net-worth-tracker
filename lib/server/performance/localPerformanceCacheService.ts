import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";

const PERFORMANCE_CACHE_SETTINGS_KEY = "performanceCache";

export type LocalPerformanceCachePayload = {
  cacheKey: string;
  cachedAt: string;
  data: Record<string, unknown>;
};

export async function getLocalPerformanceCache(
  userId: string
): Promise<LocalPerformanceCachePayload | null> {
  const row = await prisma.userSetting.findUnique({
    where: { userId },
    select: { data: true },
  });

  if (!row?.data || !isRecord(row.data)) {
    return null;
  }

  const rawCache = row.data[PERFORMANCE_CACHE_SETTINGS_KEY];
  if (!isRecord(rawCache)) {
    return null;
  }

  const cacheKey = typeof rawCache.cacheKey === "string" ? rawCache.cacheKey : null;
  const cachedAt = normalizeCachedAt(rawCache.cachedAt);
  const data = isRecord(rawCache.data) ? rawCache.data : null;

  if (!cacheKey || !cachedAt || !data) {
    return null;
  }

  return { cacheKey, cachedAt, data };
}

export async function setLocalPerformanceCache(
  userId: string,
  cacheKey: string,
  data: Record<string, unknown>
): Promise<LocalPerformanceCachePayload> {
  const cachedAt = new Date().toISOString();
  const nextCache: LocalPerformanceCachePayload = {
    cacheKey,
    cachedAt,
    data,
  };

  const existing = await prisma.userSetting.findUnique({
    where: { userId },
    select: { data: true },
  });
  const existingData = existing?.data && isRecord(existing.data)
    ? existing.data
    : {};
  const mergedData = {
    ...existingData,
    [PERFORMANCE_CACHE_SETTINGS_KEY]: nextCache,
  };

  await prisma.userSetting.upsert({
    where: { userId },
    create: {
      userId,
      data: { [PERFORMANCE_CACHE_SETTINGS_KEY]: nextCache } as Prisma.InputJsonValue,
    },
    update: {
      data: mergedData as Prisma.InputJsonValue,
    },
  });

  return nextCache;
}

function normalizeCachedAt(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

import "server-only";

import { prisma } from "@/lib/server/prisma";
import type {
  ColorTheme,
  UserPreferences,
} from "@/lib/services/userPreferencesService";

export async function getLocalUserPreferences(
  userId: string
): Promise<UserPreferences> {
  const preferences = await prisma.userPreference.findUnique({
    where: { userId },
  });

  if (!preferences) {
    return {};
  }

  return {
    colorTheme: preferences.colorTheme as ColorTheme | undefined,
  };
}

export async function setLocalUserPreferences(
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<void> {
  await prisma.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      colorTheme: preferences.colorTheme,
    },
    update: {
      colorTheme: preferences.colorTheme,
    },
  });
}

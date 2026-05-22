import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    userPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  getLocalUserPreferences,
  setLocalUserPreferences,
} from "@/lib/server/settings/localUserPreferencesService";

describe("local user preferences service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty preferences when no row exists", async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue(null);

    await expect(getLocalUserPreferences("user-1")).resolves.toEqual({});
    expect(prismaMock.userPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("returns stored color theme", async () => {
    prismaMock.userPreference.findUnique.mockResolvedValue({
      userId: "user-1",
      colorTheme: "cyberpunk",
    });

    await expect(getLocalUserPreferences("user-1")).resolves.toEqual({
      colorTheme: "cyberpunk",
    });
  });

  it("upserts partial preferences for a user", async () => {
    await setLocalUserPreferences("user-1", {
      colorTheme: "solar-dusk",
    });

    expect(prismaMock.userPreference.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        colorTheme: "solar-dusk",
      },
      update: {
        colorTheme: "solar-dusk",
      },
    });
  });
});

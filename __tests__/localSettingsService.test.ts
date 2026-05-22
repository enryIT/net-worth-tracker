import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    userSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  getLocalSettings,
  setLocalSettings,
} from "@/lib/server/settings/localSettingsService";

describe("local settings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no settings row exists", async () => {
    prismaMock.userSetting.findUnique.mockResolvedValue(null);

    await expect(getLocalSettings("user-1")).resolves.toBeNull();
    expect(prismaMock.userSetting.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("returns stored settings data", async () => {
    prismaMock.userSetting.findUnique.mockResolvedValue({
      userId: "user-1",
      data: {
        userAge: 42,
        targets: {
          equity: { targetPercentage: 60 },
        },
      },
    });

    await expect(getLocalSettings("user-1")).resolves.toEqual({
      userAge: 42,
      targets: {
        equity: { targetPercentage: 60 },
      },
    });
  });

  it("merges partial updates with existing settings", async () => {
    prismaMock.userSetting.findUnique.mockResolvedValue({
      userId: "user-1",
      data: {
        userAge: 42,
        targets: {
          equity: { targetPercentage: 60 },
        },
      },
    });

    await setLocalSettings("user-1", {
      riskFreeRate: 2,
    });

    expect(prismaMock.userSetting.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        data: {
          riskFreeRate: 2,
        },
      },
      update: {
        data: {
          userAge: 42,
          riskFreeRate: 2,
          targets: {
            equity: { targetPercentage: 60 },
          },
        },
      },
    });
  });
});

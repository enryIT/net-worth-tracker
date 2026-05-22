import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getLocalSettingsMock, setLocalSettingsMock } = vi.hoisted(() => ({
  getLocalSettingsMock: vi.fn(),
  setLocalSettingsMock: vi.fn(),
}));

vi.mock("@/lib/server/settings/localSettingsService", () => ({
  getLocalSettings: getLocalSettingsMock,
  setLocalSettings: setLocalSettingsMock,
}));

import {
  getLocalGoalData,
  saveLocalGoalData,
} from "@/lib/server/goals/localGoalDataService";
import type { GoalBasedInvestingData } from "@/types/goals";

const goalData: GoalBasedInvestingData = {
  goals: [
    {
      id: "goal-1",
      name: "Acquisto Casa",
      targetAmount: 100000,
      priority: "alta",
      color: "#3B82F6",
      createdAt: "2026-05-20T10:00:00.000Z" as unknown as Date,
      updatedAt: "2026-05-20T10:00:00.000Z" as unknown as Date,
    },
  ],
  assignments: [{ goalId: "goal-1", assetId: "asset-1", percentage: 50 }],
};

describe("local goal data service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when settings are missing", async () => {
    getLocalSettingsMock.mockResolvedValue(null);

    await expect(getLocalGoalData("user-1")).resolves.toBeNull();
  });

  it("returns null when goal data has not been stored", async () => {
    getLocalSettingsMock.mockResolvedValue({ userAge: 42 });

    await expect(getLocalGoalData("user-1")).resolves.toBeNull();
  });

  it("returns stored goal data from local settings", async () => {
    getLocalSettingsMock.mockResolvedValue({
      goalBasedInvesting: goalData,
    });

    await expect(getLocalGoalData("user-1")).resolves.toEqual(goalData);
  });

  it("saves goal data under the goalBasedInvesting settings key", async () => {
    await saveLocalGoalData("user-1", goalData);

    expect(setLocalSettingsMock).toHaveBeenCalledWith("user-1", {
      goalBasedInvesting: goalData,
    });
  });
});

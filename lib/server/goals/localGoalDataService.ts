import "server-only";

import type { GoalBasedInvestingData } from "@/types/goals";
import {
  getLocalSettings,
  setLocalSettings,
} from "@/lib/server/settings/localSettingsService";

const GOAL_DATA_SETTINGS_KEY = "goalBasedInvesting";

export async function getLocalGoalData(
  userId: string
): Promise<GoalBasedInvestingData | null> {
  const settings = await getLocalSettings(userId);
  const goalData = isRecord(settings) ? settings[GOAL_DATA_SETTINGS_KEY] : null;

  if (!isRecord(goalData)) {
    return null;
  }

  return {
    goals: Array.isArray(goalData.goals)
      ? (goalData.goals as GoalBasedInvestingData["goals"])
      : [],
    assignments: Array.isArray(goalData.assignments)
      ? (goalData.assignments as GoalBasedInvestingData["assignments"])
      : [],
  };
}

export async function saveLocalGoalData(
  userId: string,
  data: GoalBasedInvestingData
): Promise<void> {
  await setLocalSettings(userId, {
    [GOAL_DATA_SETTINGS_KEY]: data,
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

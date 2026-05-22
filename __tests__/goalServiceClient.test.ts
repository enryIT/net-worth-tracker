import { beforeEach, describe, expect, it, vi } from "vitest";

const { docMock, getDocMock, setDocMock } = vi.hoisted(() => ({
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
}));

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: docMock,
  getDoc: getDocMock,
  setDoc: setDocMock,
  Timestamp: {
    now: () => ({ toDate: () => new Date("2026-05-20T10:00:00.000Z") }),
  },
}));

vi.mock("@/lib/services/assetService", () => ({
  calculateAssetValue: (asset: { quantity: number; currentPrice: number }) =>
    asset.quantity * asset.currentPrice,
}));

import { getGoalData, saveGoalData } from "@/lib/services/goalService";
import type { GoalBasedInvestingData } from "@/types/goals";

const goalData: GoalBasedInvestingData = {
  goals: [
    {
      id: "goal-1",
      name: "Acquisto Casa",
      targetAmount: 100000,
      targetDate: "2030-01-01",
      priority: "alta",
      color: "#3B82F6",
      recommendedAllocation: { bonds: 70, equity: 20, cash: 10 },
      notes: "Anticipo mutuo",
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
      updatedAt: new Date("2026-05-20T10:00:00.000Z"),
    },
  ],
  assignments: [
    {
      goalId: "goal-1",
      assetId: "asset-1",
      percentage: 50,
    },
  ],
};

describe("goalService client API wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("loads goal data through the local goals API", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(goalData), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(getGoalData("legacy-user-id")).resolves.toEqual({
      ...goalData,
      goals: [
        {
          ...goalData.goals[0],
          createdAt: "2026-05-20T10:00:00.000Z",
          updatedAt: "2026-05-20T10:00:00.000Z",
        },
      ],
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/goals", {
      method: "GET",
      credentials: "include",
    });
    expect(docMock).not.toHaveBeenCalled();
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it("preserves missing goal data as null", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify(null), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(getGoalData("legacy-user-id")).resolves.toBeNull();
  });

  it("saves goal data through the local goals API", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(saveGoalData("legacy-user-id", goalData)).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith("/api/goals", {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(goalData),
    });
    expect(docMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });
});

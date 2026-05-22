import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  getLocalGoalDataMock,
  requireUserSessionMock,
  saveLocalGoalDataMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  getLocalGoalDataMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  saveLocalGoalDataMock: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  AuthSessionError: class AuthSessionError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = "AuthSessionError";
    }
  },
  assertWritableUser: assertWritableUserMock,
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/goals/localGoalDataService", () => ({
  getLocalGoalData: getLocalGoalDataMock,
  saveLocalGoalData: saveLocalGoalDataMock,
}));

import { GET, PUT } from "@/app/api/goals/route";
import { AuthSessionError } from "@/lib/server/auth/session";
import type { GoalBasedInvestingData } from "@/types/goals";

const authenticatedUser = {
  id: "user-1",
  email: "[EMAIL]",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

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

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/goals", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local goals route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns goal data for the authenticated user", async () => {
    getLocalGoalDataMock.mockResolvedValue(goalData);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLocalGoalDataMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual(goalData);
  });

  it("returns null when the authenticated user has no stored goal data", async () => {
    getLocalGoalDataMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });

  it("returns 401 when the user is not authenticated", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
  });

  it("saves goal data for writable users", async () => {
    saveLocalGoalDataMock.mockResolvedValue(undefined);

    const response = await PUT(createJsonRequest(goalData));

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(saveLocalGoalDataMock).toHaveBeenCalledWith("user-1", goalData);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects invalid goal data before reaching the service", async () => {
    const response = await PUT(
      createJsonRequest({
        goals: [{ id: "goal-1", name: "Missing required fields" }],
        assignments: [],
      })
    );

    expect(response.status).toBe(400);
    expect(saveLocalGoalDataMock).not.toHaveBeenCalled();
  });

  it("blocks writes for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await PUT(createJsonRequest(goalData));

    expect(response.status).toBe(403);
    expect(saveLocalGoalDataMock).not.toHaveBeenCalled();
  });
});

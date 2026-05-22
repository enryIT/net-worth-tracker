import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  buildAssistantHistoryContextMock,
  buildAssistantMonthContextMock,
  getLocalAssistantMemoryDocumentMock,
  getLocalSettingsMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  buildAssistantHistoryContextMock: vi.fn(),
  buildAssistantMonthContextMock: vi.fn(),
  getLocalAssistantMemoryDocumentMock: vi.fn(),
  getLocalSettingsMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
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
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/assistant/localAssistantMemoryService", () => ({
  getLocalAssistantMemoryDocument: getLocalAssistantMemoryDocumentMock,
}));

vi.mock("@/lib/server/settings/localSettingsService", () => ({
  getLocalSettings: getLocalSettingsMock,
}));

vi.mock("@/lib/services/assistantMonthContextService", () => ({
  buildAssistantHistoryContext: buildAssistantHistoryContextMock,
  buildAssistantMonthContext: buildAssistantMonthContextMock,
  buildAssistantYearContext: vi.fn(),
  buildAssistantYtdContext: vi.fn(),
}));

import { GET } from "@/app/api/ai/assistant/context/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createRequest(url: string): NextRequest {
  return new NextRequest(url);
}

describe("local assistant context route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: "balanced",
        includeMacroContext: false,
        memoryEnabled: true,
        includeDummySnapshots: true,
      },
      items: [],
      suggestions: [],
      updatedAt: new Date("2026-05-20T10:00:00.000Z"),
      hasDummySnapshots: false,
    });
    getLocalSettingsMock.mockResolvedValue({
      cashflowHistoryStartYear: 2021,
    });
    buildAssistantMonthContextMock.mockResolvedValue({
      selector: { year: 2026, month: 5 },
      currentSnapshot: null,
      previousSnapshot: null,
      cashflow: {
        totalIncome: 0,
        totalExpenses: 0,
        totalDividends: 0,
        netCashFlow: 0,
        transactionCount: 0,
      },
      netWorth: {
        start: null,
        end: null,
        delta: null,
        deltaPct: null,
      },
      allocationChanges: [],
      topExpensesByCategory: [],
      topIndividualExpenses: [],
      bySubCategoryAllocation: {},
      dataQuality: {
        hasSnapshot: false,
        hasPreviousBaseline: false,
        hasCashflowData: false,
        isPartialMonth: true,
        notes: [],
      },
    });
    buildAssistantHistoryContextMock.mockResolvedValue({
      selector: { year: 2021, month: -2 },
      currentSnapshot: null,
      previousSnapshot: null,
      cashflow: {
        totalIncome: 0,
        totalExpenses: 0,
        totalDividends: 0,
        netCashFlow: 0,
        transactionCount: 0,
      },
      netWorth: {
        start: null,
        end: null,
        delta: null,
        deltaPct: null,
      },
      allocationChanges: [],
      topExpensesByCategory: [],
      topIndividualExpenses: [],
      bySubCategoryAllocation: {},
      dataQuality: {
        hasSnapshot: false,
        hasPreviousBaseline: false,
        hasCashflowData: false,
        isPartialMonth: false,
        notes: [],
      },
    });
  });

  it("builds month context with the local session user and local preferences", async () => {
    const response = await GET(
      createRequest(
        "http://localhost/api/ai/assistant/context?userId=malicious-user&year=2026&month=5"
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      bundle: expect.objectContaining({
        selector: { year: 2026, month: 5 },
      }),
    });
    expect(requireUserSessionMock).toHaveBeenCalledOnce();
    expect(getLocalAssistantMemoryDocumentMock).toHaveBeenCalledWith("user-1");
    expect(buildAssistantMonthContextMock).toHaveBeenCalledWith(
      "user-1",
      { year: 2026, month: 5 },
      true
    );
  });

  it("builds history context from local settings", async () => {
    const response = await GET(
      createRequest(
        "http://localhost/api/ai/assistant/context?mode=history_analysis"
      )
    );

    expect(response.status).toBe(200);
    await response.json();

    expect(getLocalSettingsMock).toHaveBeenCalledWith("user-1");
    expect(buildAssistantHistoryContextMock).toHaveBeenCalledWith(
      "user-1",
      2021,
      true
    );
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET(
      createRequest("http://localhost/api/ai/assistant/context?year=2026&month=5")
    );

    expect(response.status).toBe(401);
    expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
  });
});

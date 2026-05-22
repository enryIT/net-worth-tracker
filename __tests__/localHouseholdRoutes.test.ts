import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  appendLocalHouseholdAuditEntryMock,
  assertWritableUserMock,
  getLocalHouseholdAuditEntriesMock,
  getLocalHouseholdConfigMock,
  requireUserSessionMock,
  saveLocalHouseholdConfigMock,
} = vi.hoisted(() => ({
  appendLocalHouseholdAuditEntryMock: vi.fn(),
  assertWritableUserMock: vi.fn(),
  getLocalHouseholdAuditEntriesMock: vi.fn(),
  getLocalHouseholdConfigMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  saveLocalHouseholdConfigMock: vi.fn(),
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

vi.mock("@/lib/server/household/localHouseholdService", () => ({
  appendLocalHouseholdAuditEntry: appendLocalHouseholdAuditEntryMock,
  getLocalHouseholdAuditEntries: getLocalHouseholdAuditEntriesMock,
  getLocalHouseholdConfig: getLocalHouseholdConfigMock,
  saveLocalHouseholdConfig: saveLocalHouseholdConfigMock,
}));

import {
  GET as GET_CONFIG,
  PUT as PUT_CONFIG,
} from "@/app/api/household/config/route";
import {
  GET as GET_AUDIT,
  POST as POST_AUDIT,
} from "@/app/api/household/audit/route";
import { AuthSessionError } from "@/lib/server/auth/session";
import { getDefaultHouseholdConfig } from "@/lib/utils/householdUtils";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local household routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertWritableUserMock.mockImplementation(() => undefined);
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    getLocalHouseholdConfigMock.mockResolvedValue(
      getDefaultHouseholdConfig("user-1")
    );
    getLocalHouseholdAuditEntriesMock.mockResolvedValue([]);
  });

  it("returns household config for the authenticated local user", async () => {
    const response = await GET_CONFIG();

    expect(response.status).toBe(200);
    expect(getLocalHouseholdConfigMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toMatchObject({ userId: "user-1" });
  });

  it("saves household config for writable users", async () => {
    const config = {
      ...getDefaultHouseholdConfig("malicious-user"),
      enabled: true,
    };

    const response = await PUT_CONFIG(
      createJsonRequest("http://localhost/api/household/config", config)
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(saveLocalHouseholdConfigMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        userId: "user-1",
        enabled: true,
      })
    );
  });

  it("blocks household config writes for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await PUT_CONFIG(
      createJsonRequest(
        "http://localhost/api/household/config",
        getDefaultHouseholdConfig("user-1")
      )
    );

    expect(response.status).toBe(403);
    expect(saveLocalHouseholdConfigMock).not.toHaveBeenCalled();
  });

  it("returns and appends local household audit entries", async () => {
    getLocalHouseholdAuditEntriesMock.mockResolvedValue([
      {
        id: "audit-1",
        userId: "user-1",
        entityType: "asset",
        entityId: "asset-1",
        action: "create",
        summary: "Asset creato",
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      },
    ]);

    const getResponse = await GET_AUDIT(
      new NextRequest("http://localhost/api/household/audit?limit=10")
    );

    expect(getResponse.status).toBe(200);
    expect(getLocalHouseholdAuditEntriesMock).toHaveBeenCalledWith("user-1", 10);

    const postResponse = await POST_AUDIT(
      createJsonRequest("http://localhost/api/household/audit", {
        entityType: "asset",
        entityId: "asset-1",
        action: "create",
        summary: "Asset creato",
        after: { name: "Conto" },
      })
    );

    expect(postResponse.status).toBe(200);
    expect(appendLocalHouseholdAuditEntryMock).toHaveBeenCalledWith("user-1", {
      entityType: "asset",
      entityId: "asset-1",
      action: "create",
      summary: "Asset creato",
      after: { name: "Conto" },
    });
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET_CONFIG();

    expect(response.status).toBe(401);
    expect(getLocalHouseholdConfigMock).not.toHaveBeenCalled();
  });
});

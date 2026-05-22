import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  requireUserSessionMock,
  scrapeLocalAssetDividendsMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  scrapeLocalAssetDividendsMock: vi.fn(),
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

vi.mock("@/lib/server/dividends/localDividendScrapeService", () => ({
  scrapeLocalAssetDividends: scrapeLocalAssetDividendsMock,
}));

import { POST } from "@/app/api/dividends/scrape/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/dividends/scrape", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local dividend scrape route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    scrapeLocalAssetDividendsMock.mockResolvedValue({
      success: true,
      message: "Dividendi importati per ENI",
      scraped: 1,
      filtered: 0,
      created: 1,
      skipped: 0,
      createdIds: ["dividend-1"],
    });
  });

  it("scrapes dividends for the authenticated user and ignores legacy userId", async () => {
    const response = await POST(
      createJsonRequest({
        userId: "legacy-firebase-user",
        assetId: "asset-1",
      })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(scrapeLocalAssetDividendsMock).toHaveBeenCalledWith("user-1", "asset-1");
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Dividendi importati per ENI",
      scraped: 1,
      filtered: 0,
      created: 1,
      skipped: 0,
      createdIds: ["dividend-1"],
    });
  });

  it("rejects invalid payloads before calling the scraper service", async () => {
    const response = await POST(createJsonRequest({ assetId: "" }));

    expect(response.status).toBe(400);
    expect(scrapeLocalAssetDividendsMock).not.toHaveBeenCalled();
  });

  it("maps missing local assets to 404", async () => {
    scrapeLocalAssetDividendsMock.mockRejectedValue(new Error("ASSET_NOT_FOUND"));

    const response = await POST(createJsonRequest({ assetId: "asset-1" }));

    expect(response.status).toBe(404);
  });

  it("returns 401 without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await POST(createJsonRequest({ assetId: "asset-1" }));

    expect(response.status).toBe(401);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  convertToEurMock,
  getBondPriceByIsinMock,
  getQuoteMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  convertToEurMock: vi.fn(),
  getBondPriceByIsinMock: vi.fn(),
  getQuoteMock: vi.fn(),
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

vi.mock("@/lib/services/yahooFinanceService", () => ({
  getQuote: getQuoteMock,
}));

vi.mock("@/lib/services/currencyConversionService", () => ({
  convertToEur: convertToEurMock,
}));

vi.mock("@/lib/services/borsaItalianaBondScraperService", () => ({
  getBondPriceByIsin: getBondPriceByIsinMock,
}));

import { GET as getBondQuote } from "@/app/api/prices/bond-quote/route";
import { GET as getQuote } from "@/app/api/prices/quote/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("local price quote routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    convertToEurMock.mockResolvedValue(58.5);
    getBondPriceByIsinMock.mockResolvedValue({
      isin: "IT0005672024",
      price: 101.5,
      currency: "EUR",
      priceType: "ultimo",
    });
    getQuoteMock.mockResolvedValue({
      ticker: "SWDA.L",
      price: 4874,
      currency: "GBp",
    });
  });

  it("fetches equity quotes with local session auth and normalizes GBp prices", async () => {
    const response = await getQuote(
      new NextRequest("http://localhost/api/prices/quote?ticker=SWDA.L")
    );

    expect(response.status).toBe(200);
    expect(requireUserSessionMock).toHaveBeenCalledOnce();
    expect(getQuoteMock).toHaveBeenCalledWith("SWDA.L");
    expect(convertToEurMock).toHaveBeenCalledWith(48.74, "GBP");
    await expect(response.json()).resolves.toEqual({
      ticker: "SWDA.L",
      price: 48.74,
      currency: "GBP",
      currentPriceEur: 58.5,
    });
  });

  it("rejects invalid quote query before calling Yahoo Finance", async () => {
    const response = await getQuote(
      new NextRequest("http://localhost/api/prices/quote")
    );

    expect(response.status).toBe(400);
    expect(getQuoteMock).not.toHaveBeenCalled();
  });

  it("fetches bond quotes with local session auth and normalized ISIN input", async () => {
    const response = await getBondQuote(
      new NextRequest("http://localhost/api/prices/bond-quote?isin=it0005672024")
    );

    expect(response.status).toBe(200);
    expect(requireUserSessionMock).toHaveBeenCalledOnce();
    expect(getBondPriceByIsinMock).toHaveBeenCalledWith("IT0005672024");
    await expect(response.json()).resolves.toEqual({
      isin: "IT0005672024",
      price: 101.5,
      currency: "EUR",
      priceType: "ultimo",
    });
  });

  it("rejects invalid ISIN before calling the bond scraper", async () => {
    const response = await getBondQuote(
      new NextRequest("http://localhost/api/prices/bond-quote?isin=bad")
    );

    expect(response.status).toBe(400);
    expect(getBondPriceByIsinMock).not.toHaveBeenCalled();
  });

  it("returns 401 without a local session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await getQuote(
      new NextRequest("http://localhost/api/prices/quote?ticker=AAPL")
    );

    expect(response.status).toBe(401);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

import type { Expense } from "@/types/expenses";
import type { MonthlySnapshot } from "@/types/assets";

vi.mock("server-only", () => ({}));

const {
  authenticatedFetchMock,
  docMock,
  getDocMock,
  setDocMock,
  timestampFromDateMock,
  timestampNowMock,
  getExpensesByDateRangeMock,
  getSettingsMock,
  getUserSnapshotsMock,
  routeAssertWritableUserMock,
  routeRequireUserSessionMock,
  routeGetLocalPerformanceCacheMock,
  routeSetLocalPerformanceCacheMock,
  userSettingFindUniqueMock,
  userSettingUpsertMock,
} = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
  timestampFromDateMock: vi.fn(),
  timestampNowMock: vi.fn(),
  getExpensesByDateRangeMock: vi.fn(),
  getSettingsMock: vi.fn(),
  getUserSnapshotsMock: vi.fn(),
  routeAssertWritableUserMock: vi.fn(),
  routeRequireUserSessionMock: vi.fn(),
  routeGetLocalPerformanceCacheMock: vi.fn(),
  routeSetLocalPerformanceCacheMock: vi.fn(),
  userSettingFindUniqueMock: vi.fn(),
  userSettingUpsertMock: vi.fn(),
}));

vi.mock("@/lib/utils/authFetch", () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: docMock,
  getDoc: getDocMock,
  setDoc: setDocMock,
  Timestamp: {
    fromDate: timestampFromDateMock,
    now: timestampNowMock,
  },
}));

vi.mock("@/lib/services/expenseService", () => ({
  getExpensesByDateRange: getExpensesByDateRangeMock,
}));

vi.mock("@/lib/services/snapshotService", () => ({
  getUserSnapshots: getUserSnapshotsMock,
}));

vi.mock("@/lib/services/assetAllocationService", () => ({
  getSettings: getSettingsMock,
}));

import { getAllPerformanceData } from "@/lib/services/performanceService";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function makeSnapshot(
  year: number,
  month: number,
  totalNetWorth: number
): MonthlySnapshot {
  return {
    year,
    month,
    totalNetWorth,
    isDummy: false,
  } as MonthlySnapshot;
}

function expectNoFirestoreCalls(): void {
  expect(docMock).not.toHaveBeenCalled();
  expect(getDocMock).not.toHaveBeenCalled();
  expect(setDocMock).not.toHaveBeenCalled();
  expect(timestampFromDateMock).not.toHaveBeenCalled();
  expect(timestampNowMock).not.toHaveBeenCalled();
}

async function loadPerformanceCacheRouteHandlers() {
  vi.resetModules();

  vi.doMock("@/lib/server/auth/session", () => ({
    AuthSessionError: class AuthSessionError extends Error {
      constructor(
        message: string,
        public readonly code: string
      ) {
        super(message);
        this.name = "AuthSessionError";
      }
    },
    assertWritableUser: routeAssertWritableUserMock,
    requireUserSession: routeRequireUserSessionMock,
  }));

  vi.doMock("@/lib/server/performance/localPerformanceCacheService", () => ({
    getLocalPerformanceCache: routeGetLocalPerformanceCacheMock,
    setLocalPerformanceCache: routeSetLocalPerformanceCacheMock,
  }));

  return await import("@/app/api/performance/cache/route");
}

async function loadLocalPerformanceCacheServiceModule() {
  vi.resetModules();
  vi.doUnmock("@/lib/server/performance/localPerformanceCacheService");

  vi.doMock("@/lib/server/prisma", () => ({
    prisma: {
      userSetting: {
        findUnique: userSettingFindUniqueMock,
        upsert: userSettingUpsertMock,
      },
    },
  }));

  return await import("@/lib/server/performance/localPerformanceCacheService");
}

describe("performanceService Firebase-to-local runtime cache migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getUserSnapshotsMock.mockResolvedValue([
      makeSnapshot(2026, 1, 100000),
      makeSnapshot(2026, 2, 110000),
    ]);
    getSettingsMock.mockResolvedValue({
      riskFreeRate: 2.5,
      dividendIncomeCategoryId: "dividendi",
    });
    getExpensesByDateRangeMock.mockResolvedValue([] as Expense[]);
  });

  it("keeps performanceService free from firebase runtime imports", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/services/performanceService.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/firebase\/firestore|@\/lib\/firebase\/config/);
    expect(source).not.toMatch(/\bTimestamp\b|\bgetDoc\b|\bsetDoc\b|\bdb\b/);
  });

  it("reads and writes performance cache through local API boundary", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await getAllPerformanceData("legacy-user");

    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/performance/cache",
      { method: "GET" }
    );
    expect(authenticatedFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/performance/cache",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      }
    );

    const putBody = JSON.parse(
      authenticatedFetchMock.mock.calls[1]?.[1]?.body as string
    ) as { cacheKey?: string; data?: unknown };

    expect(putBody.cacheKey).toBe("2-2026-2-110000");
    expect(isRecord(putBody.data)).toBe(true);
    if (!isRecord(putBody.data)) {
      throw new Error("Expected serialized performance payload object");
    }
    expect(isRecord(putBody.data.ytd)).toBe(true);
    if (!isRecord(putBody.data.ytd)) {
      throw new Error("Expected serialized YTD payload object");
    }
    expect(typeof putBody.data.ytd.startDate).toBe("string");
    expect(typeof putBody.data.ytd.endDate).toBe("string");
    expect(typeof putBody.data.lastUpdated).toBe("string");

    expect(result.snapshotCount).toBe(2);
    expectNoFirestoreCalls();
  });

  it("reuses local cache payload and skips expense fetch when cache key matches", async () => {
    authenticatedFetchMock
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await getAllPerformanceData("legacy-user");

    const initialPutBody = JSON.parse(
      authenticatedFetchMock.mock.calls[1]?.[1]?.body as string
    ) as { cacheKey: string; data: unknown };

    vi.clearAllMocks();

    getUserSnapshotsMock.mockResolvedValue([
      makeSnapshot(2026, 1, 100000),
      makeSnapshot(2026, 2, 110000),
    ]);
    getSettingsMock.mockResolvedValue({
      riskFreeRate: 2.5,
      dividendIncomeCategoryId: "dividendi",
    });

    authenticatedFetchMock.mockResolvedValueOnce(
      jsonResponse({
        cacheKey: initialPutBody.cacheKey,
        cachedAt: new Date().toISOString(),
        data: initialPutBody.data,
      })
    );

    const cachedResult = await getAllPerformanceData("legacy-user");

    expect(authenticatedFetchMock).toHaveBeenCalledWith(
      "/api/performance/cache",
      { method: "GET" }
    );
    expect(getExpensesByDateRangeMock).not.toHaveBeenCalled();
    expect(cachedResult.snapshotCount).toBe(2);
    expect(cachedResult.lastUpdated).toBeInstanceOf(Date);
    expect(cachedResult.ytd.startDate).toBeInstanceOf(Date);
    expect(cachedResult.ytd.endDate).toBeInstanceOf(Date);
    expectNoFirestoreCalls();
  });
});

describe("local performance cache route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeRequireUserSessionMock.mockResolvedValue(authenticatedUser);
    routeAssertWritableUserMock.mockImplementation(() => undefined);
    routeGetLocalPerformanceCacheMock.mockResolvedValue(null);
    routeSetLocalPerformanceCacheMock.mockResolvedValue({
      cacheKey: "cache-1",
      cachedAt: "2026-06-01T08:00:00.000Z",
      data: {},
    });
  });

  it("returns the cached payload for authenticated users", async () => {
    routeGetLocalPerformanceCacheMock.mockResolvedValue({
      cacheKey: "cache-1",
      cachedAt: "2026-06-01T08:00:00.000Z",
      data: { ytd: { startDate: "2026-01-01T00:00:00.000Z" } },
    });

    const { GET } = await loadPerformanceCacheRouteHandlers();
    const response = await GET();

    expect(response.status).toBe(200);
    expect(routeGetLocalPerformanceCacheMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      cacheKey: "cache-1",
      cachedAt: "2026-06-01T08:00:00.000Z",
      data: { ytd: { startDate: "2026-01-01T00:00:00.000Z" } },
    });
  });

  it("writes performance cache for writable users", async () => {
    const { PUT } = await loadPerformanceCacheRouteHandlers();
    const response = await PUT(
      new NextRequest("http://localhost/api/performance/cache", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cacheKey: "cache-2",
          data: { ytd: { startDate: "2026-01-01T00:00:00.000Z" } },
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(routeAssertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(routeSetLocalPerformanceCacheMock).toHaveBeenCalledWith(
      "user-1",
      "cache-2",
      { ytd: { startDate: "2026-01-01T00:00:00.000Z" } }
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects invalid write payloads before calling the service", async () => {
    const { PUT } = await loadPerformanceCacheRouteHandlers();
    const response = await PUT(
      new NextRequest("http://localhost/api/performance/cache", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cacheKey: "", data: {} }),
      })
    );

    expect(response.status).toBe(400);
    expect(routeSetLocalPerformanceCacheMock).not.toHaveBeenCalled();
  });

  it("returns 401 when session is missing", async () => {
    const { GET } = await loadPerformanceCacheRouteHandlers();
    const { AuthSessionError } = await import("@/lib/server/auth/session");

    routeRequireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
  });
});

describe("local performance cache service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when user settings are missing", async () => {
    userSettingFindUniqueMock.mockResolvedValue(null);
    const { getLocalPerformanceCache } = await loadLocalPerformanceCacheServiceModule();

    await expect(getLocalPerformanceCache("user-1")).resolves.toBeNull();
    expect(userSettingFindUniqueMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { data: true },
    });
  });

  it("returns null for malformed cache payloads", async () => {
    userSettingFindUniqueMock.mockResolvedValue({
      data: {
        performanceCache: {
          cacheKey: 123,
          cachedAt: "2026-06-01T08:00:00.000Z",
          data: {},
        },
      },
    });

    const { getLocalPerformanceCache } = await loadLocalPerformanceCacheServiceModule();
    await expect(getLocalPerformanceCache("user-1")).resolves.toBeNull();
  });

  it("normalizes Date cachedAt values to ISO strings", async () => {
    const cachedAt = new Date("2026-06-01T08:00:00.000Z");

    userSettingFindUniqueMock.mockResolvedValue({
      data: {
        performanceCache: {
          cacheKey: "cache-iso",
          cachedAt,
          data: { ytd: { startDate: "2026-01-01T00:00:00.000Z" } },
        },
      },
    });

    const { getLocalPerformanceCache } = await loadLocalPerformanceCacheServiceModule();
    await expect(getLocalPerformanceCache("user-1")).resolves.toEqual({
      cacheKey: "cache-iso",
      cachedAt: cachedAt.toISOString(),
      data: { ytd: { startDate: "2026-01-01T00:00:00.000Z" } },
    });
  });

  it("merges cache payload into user settings on write", async () => {
    userSettingFindUniqueMock.mockResolvedValue({
      data: {
        locale: "it-IT",
      },
    });

    const { setLocalPerformanceCache } = await loadLocalPerformanceCacheServiceModule();
    const result = await setLocalPerformanceCache("user-1", "cache-write", {
      ytd: { startDate: "2026-01-01T00:00:00.000Z" },
    });

    expect(userSettingUpsertMock).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        data: {
          performanceCache: {
            cacheKey: "cache-write",
            cachedAt: expect.any(String),
            data: {
              ytd: { startDate: "2026-01-01T00:00:00.000Z" },
            },
          },
        },
      },
      update: {
        data: {
          locale: "it-IT",
          performanceCache: {
            cacheKey: "cache-write",
            cachedAt: expect.any(String),
            data: {
              ytd: { startDate: "2026-01-01T00:00:00.000Z" },
            },
          },
        },
      },
    });

    expect(result.cacheKey).toBe("cache-write");
    expect(Number.isNaN(new Date(result.cachedAt).getTime())).toBe(false);
    expect(result.data).toEqual({
      ytd: { startDate: "2026-01-01T00:00:00.000Z" },
    });
  });
});

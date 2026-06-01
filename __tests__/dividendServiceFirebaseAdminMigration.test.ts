import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("server-only", () => ({}));

const {
  listLocalDividendsMock,
  getLocalDividendByIdAnyUserMock,
  listUpcomingLocalDividendsMock,
  firebaseQueryGetMock,
} = vi.hoisted(() => ({
  listLocalDividendsMock: vi.fn(),
  getLocalDividendByIdAnyUserMock: vi.fn(),
  listUpcomingLocalDividendsMock: vi.fn(),
  firebaseQueryGetMock: vi.fn(),
}));

vi.mock("@/lib/server/dividends/localDividendService", () => ({
  listLocalDividends: listLocalDividendsMock,
  getLocalDividendByIdAnyUser: getLocalDividendByIdAnyUserMock,
  listUpcomingLocalDividends: listUpcomingLocalDividendsMock,
}));

vi.mock("@/lib/firebase/admin", () => {
  const queryRef = {
    where: vi.fn(() => queryRef),
    orderBy: vi.fn(() => queryRef),
    get: firebaseQueryGetMock,
    doc: vi.fn(() => queryRef),
    add: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return {
    adminDb: {
      collection: vi.fn(() => queryRef),
      batch: vi.fn(() => ({
        delete: vi.fn(),
        commit: vi.fn(),
      })),
    },
  };
});

vi.mock("firebase-admin/firestore", () => ({
  Timestamp: {
    fromDate: (value: Date) => value,
    now: () => new Date(),
  },
}));

describe("dividendService Firebase Admin migration boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseQueryGetMock.mockResolvedValue({ docs: [], empty: true, size: 0 });
  });

  it("keeps dividendService free of Firebase Admin runtime imports", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/services/dividendService.ts"), "utf8");

    expect(source).not.toMatch(/from ['"]@\/lib\/firebase\/admin['"]/);
    expect(source).not.toMatch(/from ['"]firebase-admin\/firestore['"]/);
  });

  it("delegates getAllDividends to local dividend helpers", async () => {
    listLocalDividendsMock.mockResolvedValue([{ id: "div-1" }]);
    const { getAllDividends } = await import("@/lib/services/dividendService");

    const result = await getAllDividends("user-1");

    expect(listLocalDividendsMock).toHaveBeenCalledWith("user-1");
    expect(result).toEqual([{ id: "div-1" }]);
  });

  it("delegates getDividendById to local dividend helpers", async () => {
    getLocalDividendByIdAnyUserMock.mockResolvedValue({ id: "div-123" });
    const { getDividendById } = await import("@/lib/services/dividendService");

    const result = await getDividendById("div-123");

    expect(getLocalDividendByIdAnyUserMock).toHaveBeenCalledWith("div-123");
    expect(result).toEqual({ id: "div-123" });
  });

  it("delegates getUpcomingDividends to local dividend helpers", async () => {
    listUpcomingLocalDividendsMock.mockResolvedValue([{ id: "upcoming-1" }]);
    const { getUpcomingDividends } = await import("@/lib/services/dividendService");

    const result = await getUpcomingDividends("user-1");

    expect(listUpcomingLocalDividendsMock).toHaveBeenCalledWith("user-1", expect.any(Date));
    expect(result).toEqual([{ id: "upcoming-1" }]);
  });
});

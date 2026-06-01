import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { collectionMock, docMock, setDocMock } = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  docMock: vi.fn(),
  setDocMock: vi.fn(),
}));

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date("2026-06-01T00:00:00.000Z") })),
    fromDate: vi.fn((value: Date) => ({ toDate: () => value })),
  },
  collection: collectionMock,
  doc: docMock,
  setDoc: setDocMock,
}));

import {
  generateDummySnapshots,
  generateSingleDummySnapshot,
} from "@/lib/services/dummySnapshotGenerator";

type FetchCall = [RequestInfo | URL, RequestInit | undefined];

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function expectNoFirestoreCalls(): void {
  expect(collectionMock).not.toHaveBeenCalled();
  expect(docMock).not.toHaveBeenCalled();
  expect(setDocMock).not.toHaveBeenCalled();
}

function getCallsByPath(path: string): FetchCall[] {
  return fetchMock.mock.calls.filter(([input]) => String(input) === path) as FetchCall[];
}

describe("dummySnapshotGenerator Firebase-to-local API migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the wrapper free from firebase runtime imports", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/services/dummySnapshotGenerator.ts"),
      "utf8"
    );

    expect(source).not.toMatch(/firebase\/firestore|@\/lib\/firebase\/config/);
  });

  it("creates monthly snapshots through /api/snapshots", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        year: 2026,
        month: 6,
      }, { status: 201 })
    );

    await generateDummySnapshots({
      userId: "legacy-firebase-user",
      initialNetWorth: 50_000,
      monthlyGrowthRate: 0.8,
      numberOfMonths: 2,
    });

    const snapshotCalls = getCallsByPath("/api/snapshots");
    expect(snapshotCalls).toHaveLength(2);
    for (const [, init] of snapshotCalls) {
      expect(init).toMatchObject({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });

      const payload = JSON.parse(String(init?.body));
      expect(payload).toMatchObject({
        isDummy: true,
      });
      expect(typeof payload.year).toBe("number");
      expect(typeof payload.month).toBe("number");
    }

    expect(getCallsByPath("/api/expense-categories")).toHaveLength(0);
    expect(getCallsByPath("/api/expenses")).toHaveLength(0);
    expectNoFirestoreCalls();
  });

  it("creates categories and expenses through local APIs when cashflow generation is enabled", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    let expenseIndex = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);

      if (path === "/api/expense-categories") {
        const body = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            id: `category-${body.type}-${body.name}`,
            userId: "session-user",
            ...body,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
          { status: 201 }
        );
      }

      if (path === "/api/expenses") {
        const body = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            id: `expense-${expenseIndex++}`,
            userId: "session-user",
            ...body,
            createdAt: "2026-06-01T00:00:00.000Z",
            updatedAt: "2026-06-01T00:00:00.000Z",
          },
          { status: 201 }
        );
      }

      if (path === "/api/snapshots") {
        const body = JSON.parse(String(init?.body));
        return jsonResponse(
          {
            userId: "session-user",
            ...body,
            createdAt: "2026-06-01T00:00:00.000Z",
          },
          { status: 201 }
        );
      }

      throw new Error(`Unexpected local API path: ${path}`);
    });

    await generateDummySnapshots({
      userId: "legacy-firebase-user",
      initialNetWorth: 80_000,
      monthlyGrowthRate: 1.1,
      numberOfMonths: 1,
      averageMonthlyIncome: 3_500,
      averageMonthlyExpenses: 2_400,
    });

    const categoryCalls = getCallsByPath("/api/expense-categories");
    const expenseCalls = getCallsByPath("/api/expenses");
    const snapshotCalls = getCallsByPath("/api/snapshots");

    expect(categoryCalls).toHaveLength(13);
    expect(expenseCalls).toHaveLength(19);
    expect(snapshotCalls).toHaveLength(1);

    expect(JSON.parse(String(categoryCalls[0][1]?.body))).toMatchObject({
      legacyFirebaseId: expect.stringMatching(/^dummy-category-/),
    });
    expect(JSON.parse(String(expenseCalls[0][1]?.body))).toMatchObject({
      legacyFirebaseId: expect.stringMatching(/^dummy-/),
      notes: expect.any(String),
    });

    expectNoFirestoreCalls();
    randomSpy.mockRestore();
  });

  it("keeps generateSingleDummySnapshot on the local snapshots API", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          year: 2025,
          month: 12,
        },
        { status: 201 }
      )
    );

    await generateSingleDummySnapshot("legacy-firebase-user", 2025, 12, 123_456);

    const snapshotCalls = getCallsByPath("/api/snapshots");
    expect(snapshotCalls).toHaveLength(1);
    expect(JSON.parse(String(snapshotCalls[0][1]?.body))).toMatchObject({
      year: 2025,
      month: 12,
      isDummy: true,
    });
    expectNoFirestoreCalls();
  });
});

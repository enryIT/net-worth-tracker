import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const {
  authenticatedFetchMock,
  docMock,
  getDocMock,
  setDocMock,
  getUserSnapshotsMock,
  getAllExpensesMock,
  calculateTotalIncomeMock,
  calculateTotalExpensesMock,
} = vi.hoisted(() => ({
  authenticatedFetchMock: vi.fn(),
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
  getUserSnapshotsMock: vi.fn(),
  getAllExpensesMock: vi.fn(),
  calculateTotalIncomeMock: vi.fn(),
  calculateTotalExpensesMock: vi.fn(),
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
    now: () => ({ toDate: () => new Date("2026-05-31T10:00:00.000Z") }),
  },
}));

vi.mock("@/lib/services/snapshotService", () => ({
  getUserSnapshots: getUserSnapshotsMock,
}));

vi.mock("@/lib/services/expenseService", () => ({
  getAllExpenses: getAllExpensesMock,
  calculateTotalIncome: calculateTotalIncomeMock,
  calculateTotalExpenses: calculateTotalExpensesMock,
}));

import {
  addHallOfFameNote,
  deleteHallOfFameNote,
  getHallOfFameData,
  updateHallOfFame,
  updateHallOfFameNote,
} from "@/lib/services/hallOfFameService";

const baseHallOfFamePayload = {
  userId: "session-user",
  notes: [
    {
      id: "note-1",
      text: "Nota",
      sections: ["bestMonthsByIncome"],
      year: 2026,
      month: 1,
      createdAt: "2026-05-31T10:00:00.000Z",
      updatedAt: "2026-05-31T10:00:00.000Z",
    },
  ],
  bestMonthsByNetWorthGrowth: [],
  bestMonthsByIncome: [],
  worstMonthsByNetWorthDecline: [],
  worstMonthsByExpenses: [],
  bestYearsByNetWorthGrowth: [],
  bestYearsByIncome: [],
  worstYearsByNetWorthDecline: [],
  worstYearsByExpenses: [],
  updatedAt: "2026-05-31T10:00:00.000Z",
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

function expectNoFirestoreCalls(): void {
  expect(docMock).not.toHaveBeenCalled();
  expect(getDocMock).not.toHaveBeenCalled();
  expect(setDocMock).not.toHaveBeenCalled();
}

describe("hallOfFameService Firebase-to-local API migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserSnapshotsMock.mockResolvedValue([]);
    getAllExpensesMock.mockResolvedValue([]);
    calculateTotalIncomeMock.mockReturnValue(0);
    calculateTotalExpensesMock.mockReturnValue(0);
    getDocMock.mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    });
    setDocMock.mockResolvedValue(undefined);
  });

  it("keeps the client wrapper free from firebase runtime imports", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/services/hallOfFameService.ts"), "utf8");

    expect(source).not.toMatch(/firebase\/firestore|@\/lib\/firebase\/config/);
  });

  it("loads Hall of Fame data through /api/hall-of-fame", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse(baseHallOfFamePayload));

    const data = await getHallOfFameData("legacy-user-id");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/hall-of-fame", {
      method: "GET",
    });
    expect(data?.userId).toBe("session-user");
    expect(data?.updatedAt).toBeInstanceOf(Date);
    expectNoFirestoreCalls();
  });

  it("returns null when Hall of Fame does not exist", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Hall of Fame data not found" }, { status: 404 })
    );

    const data = await getHallOfFameData("legacy-user-id");

    expect(data).toBeNull();
    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/hall-of-fame", {
      method: "GET",
    });
    expectNoFirestoreCalls();
  });

  it("recalculates through /api/hall-of-fame/recalculate", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await updateHallOfFame("legacy-user-id");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/hall-of-fame/recalculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "legacy-user-id" }),
    });
    expectNoFirestoreCalls();
  });

  it("adds notes through /api/hall-of-fame/notes", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(
      jsonResponse({
        ...baseHallOfFamePayload.notes[0],
        id: "note-new",
      }, { status: 201 })
    );

    const note = await addHallOfFameNote("legacy-user-id", {
      text: "Nuova nota",
      sections: ["bestMonthsByIncome"],
      year: 2026,
      month: 1,
    });

    expect(note.id).toBe("note-new");
    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/hall-of-fame/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Nuova nota",
        sections: ["bestMonthsByIncome"],
        year: 2026,
        month: 1,
      }),
    });
    expectNoFirestoreCalls();
  });

  it("updates notes through /api/hall-of-fame/notes/[noteId]", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await updateHallOfFameNote("legacy-user-id", "note-1", {
      text: "Aggiornata",
      sections: ["bestYearsByIncome"],
    });

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/hall-of-fame/notes/note-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Aggiornata",
        sections: ["bestYearsByIncome"],
      }),
    });
    expectNoFirestoreCalls();
  });

  it("deletes notes through /api/hall-of-fame/notes/[noteId]", async () => {
    authenticatedFetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await deleteHallOfFameNote("legacy-user-id", "note-1");

    expect(authenticatedFetchMock).toHaveBeenCalledWith("/api/hall-of-fame/notes/note-1", {
      method: "DELETE",
    });
    expectNoFirestoreCalls();
  });
});

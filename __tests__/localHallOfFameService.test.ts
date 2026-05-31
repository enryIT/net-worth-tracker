import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    expense: {
      findMany: vi.fn(),
    },
    hallOfFame: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    monthlySnapshot: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import { updateLocalHallOfFame } from "@/lib/server/hall-of-fame/localHallOfFameService";
import {
  addLocalHallOfFameNote,
  deleteLocalHallOfFameNote,
  getLocalHallOfFameData,
  updateLocalHallOfFameNote,
} from "@/lib/server/hall-of-fame/localHallOfFameService";

const baseHallOfFameRow = {
  userId: "user-1",
  notes: [
    {
      id: "note-1",
      text: "Keep me",
      sections: ["bestMonthsByIncome"],
      year: 2026,
      month: 5,
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-01T12:00:00.000Z",
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
  updatedAt: new Date("2026-05-31T10:00:00.000Z"),
};

describe("local hall of fame service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.hallOfFame.findUnique.mockResolvedValue(baseHallOfFameRow);
    prismaMock.hallOfFame.update.mockResolvedValue(baseHallOfFameRow);
    prismaMock.hallOfFame.upsert.mockResolvedValue({});
  });

  it("recalculates rankings from local snapshots and expenses while preserving notes", async () => {
    prismaMock.monthlySnapshot.findMany.mockResolvedValue([
      {
        year: 2025,
        month: 12,
        totalNetWorth: 90000,
      },
      {
        year: 2026,
        month: 1,
        totalNetWorth: 100000,
      },
      {
        year: 2026,
        month: 2,
        totalNetWorth: 98000,
      },
      {
        year: 2026,
        month: 3,
        totalNetWorth: 105000,
      },
    ]);
    prismaMock.expense.findMany.mockResolvedValue([
      { type: "income", amount: 3000, date: new Date("2026-01-15T12:00:00.000Z") },
      { type: "fixed", amount: -900, date: new Date("2026-01-20T12:00:00.000Z") },
      { type: "income", amount: 2500, date: new Date("2026-02-15T12:00:00.000Z") },
      { type: "variable", amount: -4000, date: new Date("2026-02-20T12:00:00.000Z") },
      { type: "income", amount: 1000, date: new Date("2026-03-15T12:00:00.000Z") },
      { type: "fixed", amount: -500, date: new Date("2026-03-20T12:00:00.000Z") },
    ]);

    await updateLocalHallOfFame("user-1");

    expect(prismaMock.monthlySnapshot.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ date: "desc" }],
    });
    expect(prismaMock.hallOfFame.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: expect.objectContaining({
        userId: "user-1",
        notes: [expect.objectContaining({ id: "note-1", text: "Keep me" })],
        bestMonthsByNetWorthGrowth: [
          expect.objectContaining({ month: 1, netWorthDiff: 10000 }),
          expect.objectContaining({ month: 3, netWorthDiff: 7000 }),
        ],
        worstMonthsByNetWorthDecline: [
          expect.objectContaining({ month: 2, netWorthDiff: -2000 }),
        ],
        bestMonthsByIncome: [
          expect.objectContaining({ month: 1, totalIncome: 3000 }),
          expect.objectContaining({ month: 2, totalIncome: 2500 }),
          expect.objectContaining({ month: 3, totalIncome: 1000 }),
        ],
        worstMonthsByExpenses: [
          expect.objectContaining({ month: 2, totalExpenses: 4000 }),
          expect.objectContaining({ month: 1, totalExpenses: 900 }),
          expect.objectContaining({ month: 3, totalExpenses: 500 }),
        ],
        bestYearsByNetWorthGrowth: [
          expect.objectContaining({ year: 2026, netWorthDiff: 15000 }),
        ],
      }),
      update: expect.objectContaining({
        notes: [expect.objectContaining({ id: "note-1", text: "Keep me" })],
        updatedAt: expect.any(Date),
      }),
    });
  });

  it("returns null when Hall of Fame has not been created yet", async () => {
    prismaMock.hallOfFame.findUnique.mockResolvedValueOnce(null);

    await expect(getLocalHallOfFameData("user-1")).resolves.toBeNull();
  });

  it("returns stored Hall of Fame data for the authenticated user", async () => {
    await expect(getLocalHallOfFameData("user-1")).resolves.toEqual(
      expect.objectContaining({
        userId: "user-1",
        notes: [expect.objectContaining({ id: "note-1" })],
        updatedAt: new Date("2026-05-31T10:00:00.000Z"),
      })
    );
  });

  it("adds note entries while preserving existing Hall of Fame document data", async () => {
    const created = await addLocalHallOfFameNote("user-1", {
      text: "  Nuova nota  ",
      sections: ["bestMonthsByIncome"],
      year: 2026,
      month: 5,
    });

    expect(created.text).toBe("Nuova nota");
    expect(created.sections).toEqual(["bestMonthsByIncome"]);
    expect(created.year).toBe(2026);
    expect(created.month).toBe(5);
    expect(prismaMock.hallOfFame.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        notes: [
          expect.objectContaining({ id: "note-1", text: "Keep me" }),
          expect.objectContaining({
            id: created.id,
            text: "Nuova nota",
            sections: ["bestMonthsByIncome"],
            year: 2026,
            month: 5,
          }),
        ],
        updatedAt: expect.any(Date),
      },
    });
  });

  it("validates note text and sections before adding a note", async () => {
    await expect(
      addLocalHallOfFameNote("user-1", {
        text: " ",
        sections: ["bestMonthsByIncome"],
        year: 2026,
      })
    ).rejects.toThrow("Note text cannot be empty");

    await expect(
      addLocalHallOfFameNote("user-1", {
        text: "x".repeat(501),
        sections: ["bestMonthsByIncome"],
        year: 2026,
      })
    ).rejects.toThrow("Note text cannot exceed 500 characters");

    await expect(
      addLocalHallOfFameNote("user-1", {
        text: "Valida",
        sections: [],
        year: 2026,
      })
    ).rejects.toThrow("At least one section must be selected");
  });

  it("updates existing notes by id", async () => {
    await updateLocalHallOfFameNote("user-1", "note-1", {
      text: "  Nota aggiornata ",
      sections: ["bestYearsByIncome"],
    });

    expect(prismaMock.hallOfFame.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        notes: [
          expect.objectContaining({
            id: "note-1",
            text: "Nota aggiornata",
            sections: ["bestYearsByIncome"],
            updatedAt: expect.any(Date),
          }),
        ],
        updatedAt: expect.any(Date),
      },
    });
  });

  it("throws when updating a missing note", async () => {
    await expect(
      updateLocalHallOfFameNote("user-1", "note-missing", {
        text: "Nota aggiornata",
      })
    ).rejects.toThrow("Note not found");
  });

  it("deletes notes by id while preserving other notes", async () => {
    prismaMock.hallOfFame.findUnique.mockResolvedValueOnce({
      ...baseHallOfFameRow,
      notes: [
        baseHallOfFameRow.notes[0],
        {
          id: "note-2",
          text: "Delete me",
          sections: ["bestYearsByIncome"],
          year: 2026,
          createdAt: "2026-05-10T12:00:00.000Z",
          updatedAt: "2026-05-10T12:00:00.000Z",
        },
      ],
    });

    await deleteLocalHallOfFameNote("user-1", "note-2");

    expect(prismaMock.hallOfFame.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        notes: [expect.objectContaining({ id: "note-1" })],
        updatedAt: expect.any(Date),
      },
    });
  });
});

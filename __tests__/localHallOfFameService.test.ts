import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    expense: {
      findMany: vi.fn(),
    },
    hallOfFame: {
      findUnique: vi.fn(),
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

describe("local hall of fame service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.hallOfFame.findUnique.mockResolvedValue({
      notes: [{ id: "note-1", text: "Keep me" }],
    });
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
        notes: [{ id: "note-1", text: "Keep me" }],
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
        notes: [{ id: "note-1", text: "Keep me" }],
        updatedAt: expect.any(Date),
      }),
    });
  });
});

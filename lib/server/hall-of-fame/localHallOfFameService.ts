import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { getItalyMonthYear, getItalyYear, toDate } from "@/lib/utils/dateHelpers";
import { createId } from "@/lib/utils/idHelpers";
import type {
  HallOfFameData,
  HallOfFameNote,
  HallOfFameSectionKey,
  MonthlyRecord,
  YearlyRecord,
} from "@/types/hall-of-fame";

const MAX_MONTHLY_RECORDS = 20;
const MAX_YEARLY_RECORDS = 10;

type SnapshotRow = {
  year: number;
  month: number;
  totalNetWorth: number;
};

type ExpenseRow = {
  type: string;
  amount: number;
  date: Date;
};

type HallOfFameRow = {
  userId: string;
  notes: Prisma.JsonValue;
  bestMonthsByNetWorthGrowth: Prisma.JsonValue;
  bestMonthsByIncome: Prisma.JsonValue;
  worstMonthsByNetWorthDecline: Prisma.JsonValue;
  worstMonthsByExpenses: Prisma.JsonValue;
  bestYearsByNetWorthGrowth: Prisma.JsonValue;
  bestYearsByIncome: Prisma.JsonValue;
  worstYearsByNetWorthDecline: Prisma.JsonValue;
  worstYearsByExpenses: Prisma.JsonValue;
  updatedAt: Date;
};

type HallOfFameNoteInput = {
  text: string;
  sections: HallOfFameSectionKey[];
  year: number;
  month?: number;
};

type HallOfFameNoteUpdates = {
  text?: string;
  sections?: HallOfFameSectionKey[];
};

export async function getLocalHallOfFameData(
  userId: string
): Promise<HallOfFameData | null> {
  const row = await prisma.hallOfFame.findUnique({
    where: { userId },
  });

  return row ? mapHallOfFameRow(row) : null;
}

export async function updateLocalHallOfFame(userId: string): Promise<void> {
  const [snapshots, expenses, existing] = await Promise.all([
    prisma.monthlySnapshot.findMany({
      where: { userId },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    }),
    prisma.expense.findMany({
      where: { userId },
      orderBy: [{ date: "desc" }],
    }),
    prisma.hallOfFame.findUnique({
      where: { userId },
    }),
  ]);
  const notes = Array.isArray(existing?.notes) ? existing.notes : [];
  const monthlyRecords = calculateMonthlyRecords(snapshots, expenses);
  const yearlyRecords = calculateYearlyRecords(snapshots, expenses);
  const rankings = {
    notes: notes as Prisma.InputJsonValue,
    bestMonthsByNetWorthGrowth: monthlyRecords
      .filter((record) => record.netWorthDiff > 0)
      .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
      .slice(0, MAX_MONTHLY_RECORDS) as unknown as Prisma.InputJsonValue,
    bestMonthsByIncome: [...monthlyRecords]
      .sort((a, b) => b.totalIncome - a.totalIncome)
      .slice(0, MAX_MONTHLY_RECORDS) as unknown as Prisma.InputJsonValue,
    worstMonthsByNetWorthDecline: monthlyRecords
      .filter((record) => record.netWorthDiff < 0)
      .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
      .slice(0, MAX_MONTHLY_RECORDS) as unknown as Prisma.InputJsonValue,
    worstMonthsByExpenses: [...monthlyRecords]
      .sort((a, b) => b.totalExpenses - a.totalExpenses)
      .slice(0, MAX_MONTHLY_RECORDS) as unknown as Prisma.InputJsonValue,
    bestYearsByNetWorthGrowth: yearlyRecords
      .filter((record) => record.netWorthDiff > 0)
      .sort((a, b) => b.netWorthDiff - a.netWorthDiff)
      .slice(0, MAX_YEARLY_RECORDS) as unknown as Prisma.InputJsonValue,
    bestYearsByIncome: [...yearlyRecords]
      .sort((a, b) => b.totalIncome - a.totalIncome)
      .slice(0, MAX_YEARLY_RECORDS) as unknown as Prisma.InputJsonValue,
    worstYearsByNetWorthDecline: yearlyRecords
      .filter((record) => record.netWorthDiff < 0)
      .sort((a, b) => a.netWorthDiff - b.netWorthDiff)
      .slice(0, MAX_YEARLY_RECORDS) as unknown as Prisma.InputJsonValue,
    worstYearsByExpenses: [...yearlyRecords]
      .sort((a, b) => b.totalExpenses - a.totalExpenses)
      .slice(0, MAX_YEARLY_RECORDS) as unknown as Prisma.InputJsonValue,
  };

  await prisma.hallOfFame.upsert({
    where: { userId },
    create: {
      userId,
      ...rankings,
    },
    update: {
      ...rankings,
      updatedAt: new Date(),
    },
  });
}

export async function addLocalHallOfFameNote(
  userId: string,
  noteData: HallOfFameNoteInput
): Promise<HallOfFameNote> {
  const trimmedText = validateNoteText(noteData.text);
  validateNoteSections(noteData.sections);

  const existing = await prisma.hallOfFame.findUnique({
    where: { userId },
  });

  if (!existing) {
    throw new Error("Hall of Fame data not found. Create a snapshot first.");
  }

  const now = new Date();
  const newNote: HallOfFameNote = {
    id: createId("hall-of-fame-note"),
    text: trimmedText,
    sections: noteData.sections,
    year: noteData.year,
    month: noteData.month,
    createdAt: now,
    updatedAt: now,
  };

  const existingNotes = parseHallOfFameNotes(existing.notes);
  await prisma.hallOfFame.update({
    where: { userId },
    data: {
      notes: [...existingNotes, newNote] as unknown as Prisma.InputJsonValue,
      updatedAt: now,
    },
  });

  return newNote;
}

export async function updateLocalHallOfFameNote(
  userId: string,
  noteId: string,
  updates: HallOfFameNoteUpdates
): Promise<void> {
  const sanitizedUpdates = sanitizeNoteUpdates(updates);
  const existing = await prisma.hallOfFame.findUnique({
    where: { userId },
  });

  if (!existing) {
    throw new Error("Hall of Fame data not found");
  }

  const notes = parseHallOfFameNotes(existing.notes);
  const noteIndex = notes.findIndex((note) => note.id === noteId);
  if (noteIndex === -1) {
    throw new Error("Note not found");
  }

  const now = new Date();
  const updatedNotes = [...notes];
  updatedNotes[noteIndex] = {
    ...updatedNotes[noteIndex],
    ...sanitizedUpdates,
    updatedAt: now,
  };

  await prisma.hallOfFame.update({
    where: { userId },
    data: {
      notes: updatedNotes as unknown as Prisma.InputJsonValue,
      updatedAt: now,
    },
  });
}

export async function deleteLocalHallOfFameNote(
  userId: string,
  noteId: string
): Promise<void> {
  const existing = await prisma.hallOfFame.findUnique({
    where: { userId },
  });

  if (!existing) {
    throw new Error("Hall of Fame data not found");
  }

  const notes = parseHallOfFameNotes(existing.notes);
  const now = new Date();
  await prisma.hallOfFame.update({
    where: { userId },
    data: {
      notes: notes.filter((note) => note.id !== noteId) as unknown as Prisma.InputJsonValue,
      updatedAt: now,
    },
  });
}

function calculateMonthlyRecords(
  snapshots: SnapshotRow[],
  expenses: ExpenseRow[]
): MonthlyRecord[] {
  const sortedSnapshots = [...snapshots].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  const records: MonthlyRecord[] = [];

  for (let index = 1; index < sortedSnapshots.length; index++) {
    const previous = sortedSnapshots[index - 1];
    const current = sortedSnapshots[index];
    const monthExpenses = expenses.filter((expense) => {
      const { month, year } = getItalyMonthYear(expense.date);
      return year === current.year && month === current.month;
    });

    records.push({
      year: current.year,
      month: current.month,
      monthYear: formatMonthYear(current.month, current.year),
      netWorthDiff: current.totalNetWorth - previous.totalNetWorth,
      previousNetWorth: previous.totalNetWorth,
      totalIncome: calculateIncome(monthExpenses),
      totalExpenses: calculateExpenses(monthExpenses),
    });
  }

  return records;
}

function calculateYearlyRecords(
  snapshots: SnapshotRow[],
  expenses: ExpenseRow[]
): YearlyRecord[] {
  const snapshotsByYear = groupByYear(snapshots);
  const expensesByYear = expenses.reduce<Record<number, ExpenseRow[]>>((acc, expense) => {
    const year = getItalyYear(expense.date);
    acc[year] ??= [];
    acc[year].push(expense);
    return acc;
  }, {});
  const years = new Set<number>([
    ...Object.keys(snapshotsByYear).map(Number),
    ...Object.keys(expensesByYear).map(Number),
  ]);

  return Array.from(years)
    .sort((a, b) => a - b)
    .map((year) => {
      const sorted = [...(snapshotsByYear[year] ?? [])].sort((a, b) => a.month - b.month);
      const previousSorted = [...(snapshotsByYear[year - 1] ?? [])].sort(
        (a, b) => a.month - b.month
      );
      const lastSnapshot = sorted.at(-1);
      const baselineSnapshot = previousSorted.at(-1) ?? sorted[0];
      const yearExpenses = expensesByYear[year] ?? [];

      return {
        year,
        netWorthDiff: lastSnapshot && baselineSnapshot
          ? lastSnapshot.totalNetWorth - baselineSnapshot.totalNetWorth
          : 0,
        startOfYearNetWorth: baselineSnapshot?.totalNetWorth ?? 0,
        totalIncome: calculateIncome(yearExpenses),
        totalExpenses: calculateExpenses(yearExpenses),
      };
    });
}

function groupByYear(snapshots: SnapshotRow[]): Record<number, SnapshotRow[]> {
  return snapshots.reduce<Record<number, SnapshotRow[]>>((acc, snapshot) => {
    acc[snapshot.year] ??= [];
    acc[snapshot.year].push(snapshot);
    return acc;
  }, {});
}

function calculateIncome(expenses: ExpenseRow[]): number {
  return expenses
    .filter((expense) => expense.type === "income")
    .reduce((sum, expense) => sum + Math.abs(expense.amount), 0);
}

function calculateExpenses(expenses: ExpenseRow[]): number {
  return expenses
    .filter((expense) => expense.type !== "income")
    .reduce((sum, expense) => sum + Math.abs(expense.amount), 0);
}

function formatMonthYear(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function mapHallOfFameRow(row: HallOfFameRow): HallOfFameData {
  return {
    userId: row.userId,
    notes: parseHallOfFameNotes(row.notes),
    bestMonthsByNetWorthGrowth: asArray<MonthlyRecord>(row.bestMonthsByNetWorthGrowth),
    bestMonthsByIncome: asArray<MonthlyRecord>(row.bestMonthsByIncome),
    worstMonthsByNetWorthDecline: asArray<MonthlyRecord>(row.worstMonthsByNetWorthDecline),
    worstMonthsByExpenses: asArray<MonthlyRecord>(row.worstMonthsByExpenses),
    bestYearsByNetWorthGrowth: asArray<YearlyRecord>(row.bestYearsByNetWorthGrowth),
    bestYearsByIncome: asArray<YearlyRecord>(row.bestYearsByIncome),
    worstYearsByNetWorthDecline: asArray<YearlyRecord>(row.worstYearsByNetWorthDecline),
    worstYearsByExpenses: asArray<YearlyRecord>(row.worstYearsByExpenses),
    updatedAt: row.updatedAt,
  };
}

function parseHallOfFameNotes(value: Prisma.JsonValue): HallOfFameNote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const notes = value.filter(isJsonObject);

  return notes
    .map((note) => {
      const sections = Array.isArray(note["sections"])
        ? note["sections"].filter(
          (section): section is HallOfFameSectionKey => typeof section === "string"
        )
        : [];

      return {
        id: typeof note["id"] === "string" ? note["id"] : "",
        text: typeof note["text"] === "string" ? note["text"] : "",
        sections,
        year: typeof note["year"] === "number" ? note["year"] : 0,
        month: typeof note["month"] === "number" ? note["month"] : undefined,
        createdAt: toDate(note["createdAt"] as Date | string | { toDate(): Date } | undefined),
        updatedAt: toDate(note["updatedAt"] as Date | string | { toDate(): Date } | undefined),
      };
    })
    .filter((note) => note.id !== "");
}

function validateNoteText(text: string): string {
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    throw new Error("Note text cannot be empty");
  }
  if (trimmedText.length > 500) {
    throw new Error("Note text cannot exceed 500 characters");
  }

  return trimmedText;
}

function validateNoteSections(sections: HallOfFameSectionKey[]): void {
  if (sections.length === 0) {
    throw new Error("At least one section must be selected");
  }
}

function sanitizeNoteUpdates(updates: HallOfFameNoteUpdates): HallOfFameNoteUpdates {
  const nextUpdates: HallOfFameNoteUpdates = { ...updates };
  if (nextUpdates.text !== undefined) {
    nextUpdates.text = validateNoteText(nextUpdates.text);
  }

  if (nextUpdates.sections !== undefined) {
    validateNoteSections(nextUpdates.sections);
  }

  return nextUpdates;
}

function asArray<T>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? (value as unknown as T[]) : [];
}

function isJsonObject(input: Prisma.JsonValue): input is Prisma.JsonObject {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

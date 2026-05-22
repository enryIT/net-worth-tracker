import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { getItalyMonthYear, getItalyYear } from "@/lib/utils/dateHelpers";
import type { MonthlyRecord, YearlyRecord } from "@/types/hall-of-fame";

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

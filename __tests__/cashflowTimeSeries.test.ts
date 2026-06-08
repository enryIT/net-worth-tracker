/**
 * Unit tests for cashflowTimeSeries.ts — time-bucketed income/expense/net series
 * and per-category multi-line series for the Analisi "Andamento nel Tempo" section.
 *
 * All functions are pure. getItalyYear/getItalyMonth convert to Europe/Rome; fixtures
 * use mid-month dates (day 15) to stay clear of timezone-induced month boundaries.
 *
 * Sign convention: income positive, expenses negative, transfers positive.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTimeBuckets,
  buildCategoryTimeSeries,
} from '@/lib/utils/cashflowTimeSeries';
import type { Expense } from '@/types/expenses';

function makeExpense(overrides: Partial<Expense> & { amount: number; date: Date }): Expense {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    type: 'variable',
    categoryId: 'cat1',
    categoryName: 'Spesa',
    currency: 'EUR',
    ...overrides,
    amount: overrides.amount,
    date: overrides.date,
    createdAt: overrides.date,
    updatedAt: overrides.date,
  } as Expense;
}

const d = (year: number, month: number) => new Date(year, month - 1, 15);

describe('buildTimeBuckets', () => {
  it('aggregates income, expenses and net per month, with a gap-free axis', () => {
    const expenses: Expense[] = [
      makeExpense({ type: 'income', amount: 2000, date: d(2025, 1) }),
      makeExpense({ type: 'variable', amount: -500, date: d(2025, 1) }),
      // February has no records → must still appear as a zero bucket (gap-free axis)
      makeExpense({ type: 'income', amount: 1000, date: d(2025, 3) }),
      makeExpense({ type: 'fixed', amount: -1200, date: d(2025, 3) }),
    ];

    const buckets = buildTimeBuckets(expenses, 'month', 2025);

    expect(buckets.map((b) => b.key)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(buckets[0]).toMatchObject({ income: 2000, expenses: 500, net: 1500 });
    expect(buckets[1]).toMatchObject({ income: 0, expenses: 0, net: 0 });
    // Net can be negative when expenses exceed income in the bucket
    expect(buckets[2]).toMatchObject({ income: 1000, expenses: 1200, net: -200 });
  });

  it('aggregates per year when granularity is "year"', () => {
    const expenses: Expense[] = [
      makeExpense({ type: 'income', amount: 1000, date: d(2024, 6) }),
      makeExpense({ type: 'variable', amount: -400, date: d(2024, 9) }),
      makeExpense({ type: 'income', amount: 3000, date: d(2025, 2) }),
    ];

    const buckets = buildTimeBuckets(expenses, 'year', 2024);

    expect(buckets.map((b) => b.label)).toEqual(['2024', '2025']);
    expect(buckets[0]).toMatchObject({ income: 1000, expenses: 400, net: 600 });
    expect(buckets[1]).toMatchObject({ income: 3000, expenses: 0, net: 3000 });
  });

  it('excludes transfer records (net-zero movements)', () => {
    const expenses: Expense[] = [
      makeExpense({ type: 'income', amount: 1000, date: d(2025, 1) }),
      makeExpense({ type: 'transfer', amount: 800, date: d(2025, 1) }),
    ];

    const buckets = buildTimeBuckets(expenses, 'month', 2025);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ income: 1000, expenses: 0, net: 1000 });
  });

  it('never starts buckets before historyStartYear', () => {
    const expenses: Expense[] = [
      // Pre-floor bulk-imported data must be ignored entirely
      makeExpense({ type: 'income', amount: 9999, date: d(2022, 5) }),
      makeExpense({ type: 'income', amount: 1000, date: d(2025, 1) }),
    ];

    const buckets = buildTimeBuckets(expenses, 'year', 2025);

    expect(buckets.map((b) => b.label)).toEqual(['2025']);
    expect(buckets[0].income).toBe(1000);
  });

  it('returns an empty array when there is no non-transfer data', () => {
    expect(buildTimeBuckets([], 'month', 2025)).toEqual([]);
    expect(
      buildTimeBuckets([makeExpense({ type: 'transfer', amount: 500, date: d(2025, 1) })], 'year', 2025),
    ).toEqual([]);
  });
});

describe('buildCategoryTimeSeries', () => {
  it('keeps only the top-N categories and drops the rest (no "Altro" residual)', () => {
    // 4 categories with descending totals; topN=2 → keep two, drop the other two.
    const expenses: Expense[] = [
      makeExpense({ categoryName: 'A', amount: -400, date: d(2025, 1) }),
      makeExpense({ categoryName: 'B', amount: -300, date: d(2025, 1) }),
      makeExpense({ categoryName: 'C', amount: -200, date: d(2025, 1) }),
      makeExpense({ categoryName: 'D', amount: -100, date: d(2025, 1) }),
    ];

    const { series } = buildCategoryTimeSeries(expenses, 'year', 'expenses', 2025, 2);

    // Only the two strongest categories remain; C and D are not plotted at all.
    expect(series.map((s) => s.name)).toEqual(['A', 'B']);
    // Each kept series carries only its own total — never the C+D residual (300).
    expect(series.map((s) => s.values[0])).toEqual([400, 300]);
  });

  it('aligns per-category values to the shared bucket axis', () => {
    const expenses: Expense[] = [
      makeExpense({ categoryName: 'Cibo', amount: -100, date: d(2025, 1) }),
      makeExpense({ categoryName: 'Cibo', amount: -150, date: d(2025, 3) }),
    ];

    const { buckets, series } = buildCategoryTimeSeries(expenses, 'month', 'expenses', 2025, 6);

    expect(buckets.map((b) => b.key)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(series).toHaveLength(1);
    // Jan=100, Feb=0 (gap), Mar=150
    expect(series[0]).toMatchObject({ name: 'Cibo', values: [100, 0, 150] });
  });

  it('selects only income records when chartType is "income"', () => {
    const expenses: Expense[] = [
      makeExpense({ type: 'income', categoryName: 'Stipendio', amount: 2000, date: d(2025, 1) }),
      makeExpense({ type: 'variable', categoryName: 'Spesa', amount: -500, date: d(2025, 1) }),
    ];

    const { series } = buildCategoryTimeSeries(expenses, 'year', 'income', 2025, 6);

    expect(series.map((s) => s.name)).toEqual(['Stipendio']);
    expect(series[0].values).toEqual([2000]);
  });

  it('returns empty axis and series when no matching data exists', () => {
    const result = buildCategoryTimeSeries([], 'month', 'expenses', 2025, 6);
    expect(result.buckets).toEqual([]);
    expect(result.series).toEqual([]);
  });
});

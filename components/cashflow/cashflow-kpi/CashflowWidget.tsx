'use client';

import { ArrowLeftRight } from 'lucide-react';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CategoryBreakdownList,
  type CategoryBreakdownItem,
} from '@/components/cashflow/CategoryBreakdownList';
import { CashflowKpiCarousel } from '@/components/cashflow/cashflow-kpi/CashflowKpiCarousel';
import type { ExpenseCategory } from '@/types/expenses';

// Coverage ratio → Italian health label.
export function coverageHealthLabel(ratio: number): string {
  if (ratio >= 2.0) return 'Salute ottima';
  if (ratio >= 1.3) return 'Salute buona';
  if (ratio >= 1.0) return 'In pareggio';
  return 'In deficit';
}

export interface CashflowWidgetProps {
  /** Period label shown in the card header (e.g. "MAGGIO 2026"). */
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
  /** Income / expenses ratio; null when expenses === 0. */
  ratio: number | null;
  /** Month-over-month income delta (percentage). Null when no comparison is available. */
  incomeDelta?: number | null;
  /** Month-over-month expenses delta (percentage). Null when no comparison is available. */
  expensesDelta?: number | null;
  savingsRate: number;
  expenseCategories: CategoryBreakdownItem[];
  incomeCategories: CategoryBreakdownItem[];
  /** Full expense category list — used by CategoryBreakdownList for label + icon lookup. */
  categories: ExpenseCategory[];
  /** Optional internal transfers total shown as a separate row on desktop. */
  transfers?: number;
  className?: string;
}

export function CashflowWidget({
  monthLabel,
  income,
  expenses,
  net,
  ratio,
  incomeDelta,
  expensesDelta,
  savingsRate,
  expenseCategories,
  incomeCategories,
  categories,
  transfers,
  className,
}: Readonly<CashflowWidgetProps>) {
  return (
    <Card className={cn('py-0', className)}>
      {/* `@container` makes the KPI grid + breakdown adapt to the card's own width,
          so the same widget looks right both full-width (dashboard) and inside the
          narrow 360px sidebar on the Cashflow page. */}
      <CardContent className="@container p-5">
        {/* Header eyebrow */}
        <p className="text-muted-foreground mb-3 text-[10px] font-semibold tracking-[0.1em] uppercase">
          Cashflow · {monthLabel}
        </p>

        {/* KPI grid — 2×2 when narrow, single row of 4 when wide (container query).
            The "categorie" drawer-trigger cell only shows on mobile; on tablet+ the
            inline breakdown below takes over. */}
        <CashflowKpiCarousel
          income={income}
          expenses={expenses}
          net={net}
          ratio={ratio}
          incomeDelta={incomeDelta}
          expensesDelta={expensesDelta}
          savingsRate={savingsRate}
          expenseCategories={expenseCategories}
          incomeCategories={incomeCategories}
          categories={categories}
          categoriesCell="mobile-only"
        />

        {/* ── Tablet+ : transfers + inline category breakdown ── */}
        <div className="tablet:block hidden">
          <div className="border-border mt-4 border-t" />

          {/* Transfers summary row */}
          {transfers !== undefined && transfers > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.06em] uppercase">
                <ArrowLeftRight className="h-3 w-3" />
                Trasferimenti
              </span>
              <span className="text-muted-foreground text-[13px] font-medium tabular-nums">
                {cachedFormatCurrencyEUR(transfers)}
              </span>
            </div>
          )}

          <p className="text-muted-foreground mt-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
            Voci per categorie
          </p>

          {/* Side-by-side on a wide card, stacked on a narrow one. */}
          <div className="@2xl:grid-cols-2 @2xl:gap-x-6 mt-3 grid gap-y-4">
            <div>
              <p className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
                Spese per Categoria
              </p>
              <CategoryBreakdownList items={expenseCategories} categories={categories} />
            </div>
            <div>
              <p className="text-muted-foreground mb-3 text-[11px] font-semibold tracking-[0.06em] uppercase">
                Entrate per Categoria
              </p>
              <CategoryBreakdownList items={incomeCategories} categories={categories} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

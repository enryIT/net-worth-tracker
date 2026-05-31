'use client';

import { useState } from 'react';
import { ChevronDown, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { CategoryBreakdownList, type CategoryBreakdownItem } from '@/components/cashflow/CategoryBreakdownList';
import { CashflowKpiCarousel } from '@/components/cashflow/cashflow-kpi/CashflowKpiCarousel';
import type { ExpenseCategory } from '@/types/expenses';

// Coverage ratio → Italian health label.
export function coverageHealthLabel(ratio: number): string {
  if (ratio >= 2.0) return 'Salute ottima';
  if (ratio >= 1.3) return 'Salute buona';
  if (ratio >= 1.0) return 'In pareggio';
  return 'In deficit';
}

export interface CashflowHeroCardProps {
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

export function CashflowHeroCard({
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
}: CashflowHeroCardProps) {
  const [catsExpanded, setCatsExpanded] = useState(false);

  const hasCats = expenseCategories.length > 0 || incomeCategories.length > 0;

  return (
    <Card className={cn('py-0', className)}>
      <CardContent className="p-5">
        {/* Header eyebrow */}
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
          Cashflow · {monthLabel}
        </p>

        {/* ── MOBILE: Embla carousel ── */}
        <div className="desktop:hidden">
          <CashflowKpiCarousel
            className="-mx-5"
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
          />
        </div>

        {/* ── DESKTOP: 2×2 chip grid + categories below ── */}
        <div className="hidden desktop:block">
            <div className="grid grid-cols-2 gap-3">
              {/* Entrate */}
              <div className="bg-muted/40 rounded-xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">Entrate</p>
                <p className="text-[22px] desktop:text-[26px] font-bold font-mono tabular-nums text-emerald-500 dark:text-emerald-400 leading-none">
                  {cachedFormatCurrencyEUR(income, true)}
                </p>
                {incomeDelta != null && (() => {
                  const isZero = incomeDelta === 0;
                  const pos = incomeDelta > 0;
                  return (
                    <p className={cn('text-[12px] font-mono mt-1.5', isZero ? 'text-muted-foreground' : pos ? 'text-emerald-500 dark:text-emerald-400' : 'text-destructive')}>
                      {isZero ? '→' : pos ? '+' : ''}{incomeDelta.toFixed(1)}% vs mese scorso
                    </p>
                  );
                })()}
              </div>

              {/* Spese */}
              <div className="bg-muted/40 rounded-xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">Spese</p>
                <p className="text-[22px] desktop:text-[26px] font-bold font-mono tabular-nums text-destructive leading-none">
                  {cachedFormatCurrencyEUR(expenses, true)}
                </p>
                {expensesDelta != null && (() => {
                  const isZero = expensesDelta === 0;
                  const pos = expensesDelta > 0;
                  return (
                    <p className={cn('text-[12px] font-mono mt-1.5', isZero ? 'text-muted-foreground' : pos ? 'text-destructive' : 'text-emerald-500 dark:text-emerald-400')}>
                      {isZero ? '→' : pos ? '+' : ''}{expensesDelta.toFixed(1)}% vs mese scorso
                    </p>
                  );
                })()}
              </div>

              {/* Risparmio */}
              <div className="bg-muted/40 rounded-xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">Risparmio</p>
                <p className={cn('text-[22px] desktop:text-[26px] font-bold font-mono tabular-nums leading-none', net >= 0 ? 'text-foreground' : 'text-destructive')}>
                  {cachedFormatCurrencyEUR(net, true)}
                </p>
                {income > 0 && (
                  <p className="text-[12px] text-muted-foreground mt-1.5">{savingsRate}% del reddito</p>
                )}
              </div>

              {/* Rapporto */}
              <div className="bg-muted/40 rounded-xl p-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">Rapporto</p>
                <p className="text-[22px] desktop:text-[26px] font-bold font-mono tabular-nums text-foreground leading-none">
                  {ratio !== null ? `${ratio.toFixed(2)}×` : '—'}
                </p>
                {ratio !== null && (
                  <p className="text-[12px] text-muted-foreground mt-1.5">{coverageHealthLabel(ratio)}</p>
                )}
              </div>
            </div>

            {/* Optional transfers row */}
            {transfers != null && transfers > 0 && (
              <div className="mt-3 flex items-center justify-between bg-muted/30 rounded-xl px-3.5 py-2.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em]">Trasferimenti Interni</span>
                </div>
                <span className="text-[15px] font-mono tabular-nums text-muted-foreground">
                  {cachedFormatCurrencyEUR(transfers, true)}
                </span>
              </div>
            )}

            {/* Category breakdowns */}
            {hasCats && (
              <>
                <div className="mt-4 border-t border-border" />

                {/* Toggle button */}
                <button
                  type="button"
                  className="mt-3 w-full flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
                  onClick={() => setCatsExpanded(v => !v)}
                  aria-expanded={catsExpanded}
                >
                  <span>Voci per categorie</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none', catsExpanded && 'rotate-180')} />
                </button>

                <div className={cn('grid gap-y-4 mt-3', !catsExpanded && 'hidden')}>
                  {expenseCategories.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">Spese per Categoria</p>
                      <CategoryBreakdownList items={expenseCategories} categories={categories} />
                    </div>
                  )}
                  {incomeCategories.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">Entrate per Categoria</p>
                      <CategoryBreakdownList items={incomeCategories} categories={categories} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
      </CardContent>
    </Card>
  );
}

'use client';

/**
 * CashflowKpiCarousel — reusable KPI chip carousel for cashflow data.
 *
 * Renders five Embla carousel cards: Entrate, Spese, Risparmio Netto,
 * Rapporto, and a "Categorie" button that opens a bottom-sheet drawer.
 *
 * Pass `className` for the outer wrapper div (typically a negative-margin
 * bleed like "-mx-4" so the carousel extends to the screen or card edge).
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/carousel';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { CategoryBreakdownList, type CategoryBreakdownItem } from '../CategoryBreakdownList';
import { EmptyState, ChartEmptyIcon } from '@/components/ui/empty-state';
import { coverageHealthLabel } from '../CashflowHeroCard';
import type { ExpenseCategory } from '@/types/expenses';

// ─── Shadow token ─────────────────────────────────────────────────────────────

const CHIP_SHADOW =
  'shadow-[0_1px_3px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.08),0_12px_28px_rgba(0,0,0,0.05)]' +
  ' dark:shadow-[0_1px_3px_rgba(0,0,0,0.30),0_4px_16px_rgba(0,0,0,0.28),0_12px_28px_rgba(0,0,0,0.20)]';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDeltaColorClass(delta: number, invert = false): string {
  if (delta === 0) return 'text-muted-foreground';
  const positive = invert ? delta < 0 : delta > 0;
  return positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
}

function getDeltaArrow(delta: number): string {
  if (delta > 0) return '↑';
  if (delta < 0) return '↓';
  return '→';
}

function getRatioColorClass(ratio: number | null): string {
  if (ratio === null) return 'text-foreground';
  if (ratio >= 1) return 'text-emerald-600 dark:text-emerald-400';
  return 'text-destructive';
}

function getCategoryDescription(catView: 'expense' | 'income', hasCats: boolean): string {
  if (!hasCats) return 'Aggiungi voci per visualizzare il dettaglio per categoria.';
  const type = catView === 'expense' ? 'le spese' : 'le entrate';
  return `Nessuna voce per ${type} in questo periodo.`;
}

// ─── CategoriesDrawer ─────────────────────────────────────────────────────────

interface CategoriesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseCategories: CategoryBreakdownItem[];
  incomeCategories: CategoryBreakdownItem[];
  /** Raw Firestore categories — for icon/colour lookup. */
  categories: ExpenseCategory[];
}

function CategoriesDrawer({
  open,
  onOpenChange,
  expenseCategories,
  incomeCategories,
  categories,
}: Readonly<CategoriesDrawerProps>) {
  const [catView, setCatView] = useState<'expense' | 'income'>('expense');
  const hasCats = expenseCategories.length > 0 || incomeCategories.length > 0;
  const activeItems = catView === 'expense' ? expenseCategories : incomeCategories;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>Categorie</DrawerTitle>
          <DrawerDescription className="sr-only">
            Breakdown delle categorie per il periodo selezionato
          </DrawerDescription>
        </DrawerHeader>

        {/* Spese / Entrate toggle — only shown when either bucket has data */}
        {hasCats && (
          <div className="flex gap-1 mx-4 mb-3 bg-muted rounded-lg p-1" role="tablist" aria-label="Tipo di voci">
            <button
              type="button"
              role="tab"
              aria-selected={catView === 'expense'}
              onClick={() => setCatView('expense')}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
                catView === 'expense'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Spese
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={catView === 'income'}
              onClick={() => setCatView('income')}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
                catView === 'income'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Entrate
            </button>
          </div>
        )}

        <div className="overflow-y-auto px-4 pb-8">
          {activeItems.length === 0 ? (
            <EmptyState
              icon={ChartEmptyIcon}
              title="Nessuna categoria"
              description={getCategoryDescription(catView, hasCats)}
              className="py-10"
            />
          ) : (
            <CategoryBreakdownList items={activeItems} categories={categories} />
          )}

          {/* Banner → Analisi page */}
          <Link
            href="/dashboard/analisi"
            onClick={() => onOpenChange(false)}
            className="mt-4 flex items-center justify-between rounded-xl bg-muted/40 px-3.5 py-2.5 hover:bg-muted/60 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Vai all&apos;Analisi Cashflow</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Sankey, trend, categorie e confronti</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" aria-hidden="true" />
          </Link>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ─── DeltaRow ─────────────────────────────────────────────────────────────────

interface DeltaRowProps {
  delta: number | null | undefined;
  /** When true, a negative delta is good (e.g. expenses going down). */
  invert?: boolean;
}

function DeltaRow({ delta, invert = false }: Readonly<DeltaRowProps>) {
  if (delta === null || delta === undefined) {
    return <p className="text-[11px] text-muted-foreground mt-1.5 leading-none opacity-50">vs mese prec.</p>;
  }
  return (
    <p className={cn('text-[11px] font-medium mt-1.5 leading-none', getDeltaColorClass(delta, invert))}>
      {getDeltaArrow(delta)} {Math.abs(delta).toFixed(1)}% vs mese prec.
    </p>
  );
}

// ─── KpiChip ─────────────────────────────────────────────────────────────────

interface KpiChipProps {
  label: string;
  /** The large primary value line. */
  children: React.ReactNode;
  /** The small third-line subtext. */
  subtext: React.ReactNode;
  /** When set, renders as an interactive `<button>` with press feedback. */
  onClick?: () => void;
  /** Accessible label — required when `onClick` is set. */
  'aria-label'?: string;
}

function KpiChip({ label, children, subtext, onClick, 'aria-label': ariaLabel }: Readonly<KpiChipProps>) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          'h-full w-full bg-card rounded-2xl p-4 ring-1 ring-border/20 text-left',
          'active:scale-[0.97] transition-transform duration-100',
          CHIP_SHADOW,
        )}
      >
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
        {children}
        {subtext}
      </button>
    );
  }

  return (
    <div className={cn('h-full bg-card rounded-2xl p-4 ring-1 ring-border/20', CHIP_SHADOW)}>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      {children}
      {subtext}
    </div>
  );
}

// ─── KpiCarouselItem ─────────────────────────────────────────────────────────

/** Carousel slot with fixed chip width. Wraps every KpiChip in the carousel. */
function KpiCarouselItem({ children }: Readonly<{ children: React.ReactNode }>) {
  return <CarouselItem className="basis-[160px] pl-3">{children}</CarouselItem>;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CashflowKpiCarouselProps {
  /** Gross income for the period (positive, EUR). */
  income: number;
  /** Gross expenses for the period (negative, EUR). Displayed as `Math.abs(expenses)`. */
  expenses: number;
  /** Net savings: `income + expenses`. Can be negative. */
  net: number;
  /** Coverage ratio `income / |expenses|`. `null` when expenses === 0 → chip shows "—". */
  ratio: number | null;
  /** Month-over-month income change (%). `null` = no prior month available. */
  incomeDelta?: number | null;
  /** Month-over-month expense change (%). `null` = no prior month. Colour is inverted (down = good). */
  expensesDelta?: number | null;
  /** Savings rate 0–100. Shown as "Tasso X%" below the net savings value. */
  savingsRate: number;
  /** Aggregated expense categories for the period. Shown in the Categorie drawer. */
  expenseCategories: CategoryBreakdownItem[];
  /** Aggregated income categories for the period. Shown in the Categorie drawer. */
  incomeCategories: CategoryBreakdownItem[];
  /** Raw Firestore categories — used for icon/colour lookup in the drawer list. */
  categories: ExpenseCategory[];
  /** Class on the outermost `<div>`. Typically a negative-margin bleed, e.g. `"-mx-4"`. */
  className?: string;
  /** Controlled open state for the Categorie drawer. Omit to use internal state. */
  drawerOpen?: boolean;
  /** Called when the drawer requests an open/close transition. Required when `drawerOpen` is set. */
  onDrawerOpenChange?: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CashflowKpiCarousel({
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
  className,
  drawerOpen,
  onDrawerOpenChange,
}: Readonly<CashflowKpiCarouselProps>) {
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);
  const catDrawerOpen = drawerOpen ?? internalDrawerOpen;
  const setCatDrawerOpen = onDrawerOpenChange ?? setInternalDrawerOpen;

  const ratioDisplay = ratio === null ? '—' : `${ratio.toFixed(2)}×`;
  const ratioLabel = ratio === null ? null : coverageHealthLabel(ratio);

  return (
    <>
      <div className={className}>
        <Carousel
          opts={{ align: 'start', dragFree: true, containScroll: false }}
          className="w-full"
          aria-label="Riepilogo cashflow"
        >
          <CarouselContent viewportClassName="px-4 py-3 pb-6" className="items-stretch">

            {/* Entrate */}
            <KpiCarouselItem>
              <KpiChip label="Entrate" subtext={<DeltaRow delta={incomeDelta} />}>
                <p className="text-[21px] font-bold font-mono tabular-nums mt-1.5 leading-none text-emerald-600 dark:text-emerald-400">
                  {cachedFormatCurrencyEUR(income)}
                </p>
              </KpiChip>
            </KpiCarouselItem>

            {/* Spese */}
            <KpiCarouselItem>
              <KpiChip label="Spese" subtext={<DeltaRow delta={expensesDelta} invert />}>
                <p className="text-[21px] font-bold font-mono tabular-nums mt-1.5 leading-none text-destructive">
                  {cachedFormatCurrencyEUR(Math.abs(expenses))}
                </p>
              </KpiChip>
            </KpiCarouselItem>

            {/* Risparmio Netto */}
            <KpiCarouselItem>
              <KpiChip
                label="Risparmio Netto"
                subtext={<p className="text-[11px] text-muted-foreground mt-1.5 leading-none">Tasso {savingsRate.toFixed(1)}%</p>}
              >
                <p className={cn(
                  'text-[21px] font-bold font-mono tabular-nums mt-1.5 leading-none',
                  net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                )}>
                  {net >= 0 ? '+' : ''}{cachedFormatCurrencyEUR(net)}
                </p>
              </KpiChip>
            </KpiCarouselItem>

            {/* Rapporto */}
            <KpiCarouselItem>
              <KpiChip
                label="Rapporto"
                subtext={<p className="text-[11px] text-muted-foreground mt-1.5 leading-none">{ratioLabel ?? 'Nessun dato'}</p>}
              >
                <p className={cn('text-[21px] font-bold font-mono tabular-nums mt-1.5 leading-none', getRatioColorClass(ratio))}>
                  {ratioDisplay}
                </p>
              </KpiChip>
            </KpiCarouselItem>

            {/* Categorie — opens drawer */}
            <KpiCarouselItem>
              <KpiChip
                label="Categorie"
                onClick={() => setCatDrawerOpen(true)}
                aria-label="Apri dettaglio categorie"
                subtext={<p className="text-[11px] text-muted-foreground mt-1.5 leading-none">Vedi dettaglio →</p>}
              >
                <p className="text-[21px] font-bold tabular-nums mt-1.5 leading-none text-foreground">
                  {expenseCategories.length}
                </p>
              </KpiChip>
            </KpiCarouselItem>

          </CarouselContent>
        </Carousel>
      </div>

      <CategoriesDrawer
        open={catDrawerOpen}
        onOpenChange={setCatDrawerOpen}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        categories={categories}
      />
    </>
  );
}

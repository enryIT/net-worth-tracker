'use client';

/**
 * CashflowCategoryDrawer — used for CashflowKpiCarousel
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { CategoryBreakdownList, type CategoryBreakdownItem } from '../CategoryBreakdownList';
import { EmptyState, ChartEmptyIcon } from '@/components/ui/empty-state';
import type { ExpenseCategory } from '@/types/expenses';

function getCategoryDescription(catView: 'expense' | 'income', hasCats: boolean): string {
  if (!hasCats) return 'Aggiungi voci per visualizzare il dettaglio per categoria.';
  const type = catView === 'expense' ? 'le spese' : 'le entrate';
  return `Nessuna voce per ${type} in questo periodo.`;
}

export interface CashflowCategoryDrawerProps {
  /** Whether the drawer is open. */
  open: boolean;
  /** Called when the drawer requests an open/close transition. */
  onOpenChange: (open: boolean) => void;
  /** Aggregated expense categories for the period, sorted by amount descending. */
  expenseCategories: CategoryBreakdownItem[];
  /** Aggregated income categories for the period, sorted by amount descending. */
  incomeCategories: CategoryBreakdownItem[];
  /** Raw Firestore categories — used for icon and colour lookup in the list. */
  categories: ExpenseCategory[];
}

export function CashflowCategoryDrawer({
  open,
  onOpenChange,
  expenseCategories,
  incomeCategories,
  categories,
}: Readonly<CashflowCategoryDrawerProps>) {
  const [catView, setCatView] = useState<'expense' | 'income'>('expense');
  const hasCats = expenseCategories.length > 0 || incomeCategories.length > 0;
  const activeItems = catView === 'expense' ? expenseCategories : incomeCategories;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent minHeight="medium">
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

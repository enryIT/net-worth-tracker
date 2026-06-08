/**
 * "Andamento nel Tempo" section for the Analisi tab (history mode only).
 *
 * Fills three gaps the existing history-mode charts left open:
 *  - Chart A: income vs expenses vs net savings in € over time (ComposedChart).
 *  - Chart B: per-category multi-line trend, switchable between income and expenses.
 *
 * A single Mese/Anno granularity toggle drives both charts. The time axis always
 * starts no earlier than `historyStartYear` (the "anno inizio storico cashflow"
 * setting) — see lib/utils/cashflowTimeSeries.ts.
 *
 * PATTERNS (AGENTS.md / sibling components):
 * - Chart sub-components are module-level (React Compiler: never nest components).
 * - Colours come exclusively from useChartColors() — no hardcoded hex.
 * - Recharts tooltips are styled via CSS vars, never inline hex.
 * - Pill toggles reuse the Framer layoutId + spring(400/35) pattern of AnalisiTab.
 */
'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { type Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import {
  buildTimeBuckets,
  buildCategoryTimeSeries,
  type TimeGranularity,
} from '@/lib/utils/cashflowTimeSeries';
import { cn } from '@/lib/utils';

// ── Shared tooltip style ──────────────────────────────────────────────────────
// Defined once (mirrors ConfrontoAnnualeSection) so all sub-charts stay consistent.
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = { fontWeight: 600, color: 'var(--card-foreground)' } as const;

type CategoryChartType = 'expenses' | 'income';

// ── PillToggle ────────────────────────────────────────────────────────────────
// Generic two/three-option segmented control. Module-level for a stable reference.

function PillToggle<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded-full bg-muted p-1"
    >
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'relative px-3 py-1 text-xs font-medium rounded-full transition-colors',
            value !== key && 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value === key && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-full bg-background shadow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            />
          )}
          <span className="relative z-10">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── FlowComposedChart ─────────────────────────────────────────────────────────
// Chart A: income/expense bars + net-savings line. Module-level (React Compiler).

function FlowComposedChart({
  data,
  colors,
}: {
  data: ReturnType<typeof buildTimeBuckets>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          // Keep the 0 baseline for the bars but extend below it when net savings
          // go negative (deficit period) so the risparmio line isn't clipped.
          domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value ?? 0)),
            name === 'income' ? 'Entrate' : name === 'expenses' ? 'Uscite' : 'Risparmio',
          ]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: 'rgba(128,128,128,0.1)' }}
        />
        <Legend
          formatter={(value) =>
            value === 'income' ? 'Entrate' : value === 'expenses' ? 'Uscite' : 'Risparmio'
          }
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        />
        <Bar dataKey="income" fill={colors[0] ?? '#6366f1'} radius={[3, 3, 0, 0]} animationDuration={600} animationEasing="ease-out" />
        <Bar dataKey="expenses" fill={colors[1] ?? '#8b5cf6'} radius={[3, 3, 0, 0]} animationDuration={600} animationEasing="ease-out" />
        <Line
          type="monotone"
          dataKey="net"
          stroke={colors[2] ?? '#10b981'}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── CategoryLinesChart ────────────────────────────────────────────────────────
// Chart B: one line per category over time. Module-level (React Compiler).

function CategoryLinesChart({
  series,
  rows,
  colors,
  height,
}: {
  series: ReturnType<typeof buildCategoryTimeSeries>['series'];
  // Recharts wants row objects keyed by series name; we pivot in the parent.
  rows: Array<Record<string, string | number>>;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
          // Order tooltip rows by value (desc) so they mirror the vertical stacking
          // of the lines at the hovered point, instead of the fixed series order.
          itemSorter={(item) => -(item.value as number)}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        {series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={colors[i % colors.length] ?? '#6366f1'}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ── AndamentoStoricoSection ───────────────────────────────────────────────────

interface AndamentoStoricoSectionProps {
  allExpenses: Expense[];
  historyStartYear: number;
}

export function AndamentoStoricoSection({
  allExpenses,
  historyStartYear,
}: AndamentoStoricoSectionProps) {
  const chartColors = useChartColors();
  const isMobile = useMediaQuery('(max-width: 639px)');

  const [granularity, setGranularity] = useState<TimeGranularity>('year');
  const [categoryType, setCategoryType] = useState<CategoryChartType>('expenses');

  const flowData = useMemo(
    () => buildTimeBuckets(allExpenses, granularity, historyStartYear),
    [allExpenses, granularity, historyStartYear],
  );

  const categorySeries = useMemo(
    () => buildCategoryTimeSeries(allExpenses, granularity, categoryType, historyStartYear),
    [allExpenses, granularity, categoryType, historyStartYear],
  );

  // Pivot the per-series value arrays into Recharts row objects keyed by category name.
  // Each row carries the bucket label plus one numeric field per series.
  const categoryRows = useMemo(() => {
    return categorySeries.buckets.map((bucket, i) => {
      const row: Record<string, string | number> = { label: bucket.label };
      for (const s of categorySeries.series) row[s.name] = s.values[i];
      return row;
    });
  }, [categorySeries]);

  // A single bucket can't show a trend — treat it as "not enough data".
  const hasFlowTrend = flowData.length >= 2;
  const hasCategoryTrend = categorySeries.buckets.length >= 2 && categorySeries.series.length > 0;

  const granularityLabel = granularity === 'year' ? 'per anno' : 'per mese';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Chart A — Entrate / Uscite / Risparmio */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Entrate, Uscite e Risparmio
            </CardTitle>
            <PillToggle
              options={[
                ['month', 'Mese'],
                ['year', 'Anno'],
              ] as const}
              value={granularity}
              onChange={setGranularity}
              layoutId="andamento-granularity-pill"
              ariaLabel="Granularità temporale"
            />
          </div>
          <p className="text-xs text-muted-foreground">Andamento storico {granularityLabel}</p>
        </CardHeader>
        <CardContent className="pt-0">
          {hasFlowTrend ? (
            <FlowComposedChart data={flowData} colors={chartColors} />
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </CardContent>
      </Card>

      {/* Chart B — Per categoria (linee multiple) */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {categoryType === 'expenses' ? 'Uscite per Categoria' : 'Entrate per Categoria'}
            </CardTitle>
            <PillToggle
              options={[
                ['expenses', 'Uscite'],
                ['income', 'Entrate'],
              ] as const}
              value={categoryType}
              onChange={setCategoryType}
              layoutId="andamento-category-pill"
              ariaLabel="Tipo di flusso"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Andamento storico {granularityLabel} · prime 6 categorie
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {hasCategoryTrend ? (
            <CategoryLinesChart
              series={categorySeries.series}
              rows={categoryRows}
              colors={chartColors}
              height={isMobile ? 240 : 300}
            />
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

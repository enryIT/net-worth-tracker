'use client';

import { CSSProperties, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  staggerContainer,
  cardItem,
  heroMetricSettle,
  springLayoutTransition,
} from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/services/chartService';
import { updateHallOfFame } from '@/lib/services/hallOfFameService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Camera, Receipt, TrendingDown, TrendingUp } from 'lucide-react';
import { CashflowHeroCard } from '@/components/cashflow/CashflowHeroCard';
import { toast } from 'sonner';
import { useCreateSnapshot } from '@/lib/hooks/useSnapshots';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useExpenseCategories } from '@/lib/hooks/useExpenses';
import { SavingsRateBadge } from '@/components/ui/SavingsRateBadge';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { getGreeting } from '@/lib/utils/getGreeting';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { OverviewChartsSection } from '@/components/dashboard/OverviewChartsSection';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';

const MotionButtonShell = motion.div;

/**
 * MAIN DASHBOARD PAGE — "Bento Asimmetrico" redesign (v2)
 *
 * Layout:
 *   Mobile:  Hero → Liquid → VariationBlocks → Cashflow → [Costs] → [Fiscal] → Assets → Charts
 *   Desktop: Hero(2/3)+Liquid(1/3) → Cashflow(full) → [Costs 2-col] → [Fiscal] → Assets → Charts
 *
 * Changes from v1:
 * - Liquid card: donut replaced by flat 3-row breakdown (Liquidità/Investimenti/Illiquidi)
 * - Fiscal section: no longer collapsible, always visible when hasCostBasisTracking
 * - Asset list card: new "N Asset in Portafoglio" card with value / weight / return columns
 * - Cashflow card: full-width, 4 KPI chips + top-5 category bars; TER/Costo moved to 2-col row below
 */

// Italian month names for the cashflow card header.
const MONTH_NAMES_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export default function DashboardPage() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const prefersReducedMotion = useReducedMotion();

  const greeting = useMemo(() => {
    const italyHour = getItalyDate(new Date()).getHours();
    const result = getGreeting(italyHour);
    const firstName = user?.displayName?.split(' ')[0];
    const label = firstName && firstName.length <= 20
      ? `${result.greeting} ${firstName}`
      : result.greeting;
    return { label, subtitle: result.subtitle };
  }, [user?.displayName]);

  const { data: overview, isLoading: loadingOverview } = useDashboardOverview(user?.uid);
  const { data: expenseCategories = [] } = useExpenseCategories(user?.uid);
  const createSnapshotMutation = useCreateSnapshot(user?.uid || '');

  const loading = loadingOverview;

  // ─── UI State ─────────────────────────────────────────────────────────────────
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [snapshotDialogStyle, setSnapshotDialogStyle] = useState<CSSProperties | undefined>(undefined);

  const snapshotButtonRef = useRef<HTMLButtonElement | null>(null);
  const snapshotDialogRef = useRef<HTMLDivElement | null>(null);

  const isMobile = useMediaQuery('(max-width: 1439px)');
  const chartColors = useChartColors();

  // heroSettled becomes true when the Patrimonio Totale Lordo count-up completes.
  const [heroSettled, setHeroSettled] = useState(false);
  const handleHeroSettled = useCallback(() => setHeroSettled(true), []);

  // ─── Derived metrics ──────────────────────────────────────────────────────────
  const totalValue = overview?.metrics.totalValue ?? 0;
  const liquidNetTotal = overview?.metrics.liquidNetTotal ?? 0;

  const savingsRate = useMemo(() => {
    if (!overview?.expenseStats) return 0;
    const { income, expenses } = overview.expenseStats.currentMonth;
    if (income <= 0) return 0;
    return Math.round(((income - expenses) / income) * 100);
  }, [overview?.expenseStats]);

  // Coverage ratio (income / expenses) for RAPPORTO KPI chip.
  const coverageRatio = useMemo(() => {
    if (!overview?.expenseStats) return null;
    const { income, expenses } = overview.expenseStats.currentMonth;
    if (expenses <= 0) return null;
    return income / expenses;
  }, [overview?.expenseStats]);

  // ─── Sparkline — last 13 points (12 months + baseline) ──────────────────────
  const sparkline12m = useMemo(() => {
    if (!overview?.sparklineData) return [];
    return overview.sparklineData.slice(-13);
  }, [overview?.sparklineData]);

  // ─── Chart sections (stable memoized objects for memo isolation) ──────────────
  // Liquidity chart removed — now shown as the hero donut in the Patrimonio Liquido card.
  const chartSections = useMemo(() => [
    {
      id: 'assetClass',
      title: 'Distribuzione per Asset Class',
      data: (overview?.charts.assetClassData ?? []).map((d, i) => ({
        ...d,
        color: chartColors[i] ?? d.color,
      })),
    },
    {
      id: 'asset',
      title: 'Distribuzione per Asset',
      data: (overview?.charts.assetData ?? []).map((d, i) => ({
        ...d,
        color: chartColors[i] ?? d.color,
      })),
    },
  ] as const, [overview, chartColors]);

  // ─── Dialog position animation ────────────────────────────────────────────────
  useEffect(() => {
    if (!showConfirmDialog || prefersReducedMotion) {
      setSnapshotDialogStyle(undefined);
      return;
    }
    const frameId = requestAnimationFrame(() => {
      const trigger = snapshotButtonRef.current;
      const dialog = snapshotDialogRef.current;
      if (!trigger || !dialog) { setSnapshotDialogStyle(undefined); return; }
      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const originX = triggerRect.left + triggerRect.width / 2 - dialogRect.left;
      const originY = triggerRect.top + triggerRect.height / 2 - dialogRect.top;
      setSnapshotDialogStyle({ transformOrigin: `${originX}px ${originY}px` });
    });
    return () => cancelAnimationFrame(frameId);
  }, [showConfirmDialog, prefersReducedMotion]);

  const currentMonthReference = useMemo(() => getItalyMonthYear(), []);

  // ─── Snapshot handlers ────────────────────────────────────────────────────────
  const handleCreateSnapshot = async () => {
    if (!user) return;
    try {
      if (overview?.flags.currentMonthSnapshotExists) {
        setShowConfirmDialog(true);
      } else {
        await createSnapshot();
      }
    } catch (error) {
      console.error('Error checking existing snapshots:', error);
      toast.error('Errore nel controllo degli snapshot esistenti');
    }
  };

  const createSnapshot = async () => {
    if (!user) return;
    try {
      setCreatingSnapshot(true);
      setShowConfirmDialog(false);
      toast.loading('Aggiornamento prezzi e creazione snapshot...', { id: 'snapshot-creation' });
      const result = await createSnapshotMutation.mutateAsync({});
      toast.dismiss('snapshot-creation');
      toast.success(result.message);
      try { await updateHallOfFame(user.uid); } catch { /* non-critical */ }
    } catch (error) {
      console.error('Error creating snapshot:', error);
      toast.dismiss('snapshot-creation');
      toast.error('Errore nella creazione dello snapshot');
    } finally {
      setCreatingSnapshot(false);
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageContainer className="space-y-4">
        <div className="pb-4 border-b border-border">
          <div className="h-3 w-20 bg-muted rounded animate-pulse mb-2" />
          <div className="h-8 w-56 bg-muted rounded animate-pulse mb-2" />
          <div className="h-4 w-44 bg-muted rounded animate-pulse" />
        </div>
        {/* Hero + Liquid skeleton — mirrors the desktop:grid-cols-[2fr_1fr] live layout */}
        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <div className="h-3 w-40 bg-muted rounded animate-pulse mb-3" />
            <div className="h-12 w-52 bg-muted rounded animate-pulse mb-4" />
            <div className="flex gap-1.5 mb-3">
              <div className="h-6 w-40 bg-muted rounded animate-pulse" />
              <div className="h-6 w-28 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-[68px] bg-muted rounded animate-pulse mb-2" />
            <div className="h-7 bg-muted rounded animate-pulse" />
          </div>
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <div className="h-3 w-32 bg-muted rounded animate-pulse mb-3" />
            <div className="h-8 w-36 bg-muted rounded animate-pulse mb-4" />
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-4 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </div>
        {/* Cashflow skeleton */}
        <div className="rounded-2xl border border-border bg-card p-[22px]">
          <div className="h-3 w-36 bg-muted rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3 mb-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl bg-muted p-3 h-16 animate-pulse" />
            ))}
          </div>
          <div className="h-3 bg-muted rounded animate-pulse mb-3" />
          <div className="grid desktop:grid-cols-2 gap-4">
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-6 bg-muted rounded animate-pulse" />)}
            </div>
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-6 bg-muted rounded animate-pulse" />)}
            </div>
          </div>
        </div>

        {/* Charts skeleton — mirrors OverviewChartsSection structure */}
        <div className="border-t border-border/40 pt-4">
          <div className="h-3 w-24 bg-muted rounded animate-pulse mb-4" />
          <div className="grid desktop:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-muted h-[220px] animate-pulse" />
            <div className="rounded-2xl bg-muted h-[220px] animate-pulse" />
          </div>
        </div>
      </PageContainer>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <motion.div
      layout="position"
      transition={springLayoutTransition}
      className="max-w-[1600px] mx-auto w-full space-y-4 max-desktop:portrait:pb-20"
    >
      <PageHeader
        label="Panoramica"
        title={greeting.label}
        description={greeting.subtitle}
        actions={
          <MotionButtonShell
            whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
            transition={springLayoutTransition}
          >
            <Button
              ref={snapshotButtonRef}
              onClick={handleCreateSnapshot}
              disabled={isDemo || creatingSnapshot || (overview?.flags.assetCount ?? 0) === 0}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              variant="default"
              className="w-full sm:w-auto"
            >
              <Camera className="mr-2 h-4 w-4" />
              {creatingSnapshot ? 'Creazione...' : 'Crea Snapshot'}
            </Button>
          </MotionButtonShell>
        }
      />

      {/* ── HERO + LIQUID — desktop: 2/3 + 1/3 grid ── */}
      <motion.section
        aria-label="Patrimonio"
        layout="position"
        transition={springLayoutTransition}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">

          {/* Hero Card */}
          <motion.div layout="position" transition={springLayoutTransition} variants={heroMetricSettle}>
            <Card className="rounded-2xl overflow-hidden h-full">
              <CardContent className="p-[22px] flex flex-col h-full">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Patrimonio Totale Lordo
                </p>

                {/* Animated number */}
                <OverviewAnimatedCurrency
                  value={totalValue}
                  animateOnMount={true}
                  onSettled={handleHeroSettled}
                  className="text-[44px] font-bold font-mono tracking-[-0.03em] desktop:text-[54px]"
                />

                {/* Variation chips */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {overview?.variations.monthly && (
                    <span className={cn(
                      'inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px]',
                      'text-[15px] font-semibold font-mono tracking-[-0.01em]',
                      overview.variations.monthly.value >= 0
                        ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400'
                    )}>
                      {overview.variations.monthly.value >= 0
                        ? <TrendingUp className="h-[13px] w-[13px]" />
                        : <TrendingDown className="h-[13px] w-[13px]" />
                      }
                      {overview.variations.monthly.value >= 0 ? '+' : ''}
                      {formatCurrency(overview.variations.monthly.value)}{' '}
                      ({overview.variations.monthly.percentage >= 0 ? '+' : ''}
                      {overview.variations.monthly.percentage.toFixed(2)}%) questo mese
                    </span>
                  )}
                  {overview?.variations.yearly && (
                    <span className={cn(
                      'inline-flex items-center gap-2 rounded-[9px] px-[13px] py-[6px]',
                      'text-[15px] font-semibold font-mono tracking-[-0.01em]',
                      overview.variations.yearly.value >= 0
                        ? 'bg-green-500/10 text-green-500 dark:text-green-400'
                        : 'bg-red-500/10 text-red-500 dark:text-red-400'
                    )}>
                      {overview.variations.yearly.value >= 0
                        ? <TrendingUp className="h-[13px] w-[13px]" />
                        : <TrendingDown className="h-[13px] w-[13px]" />
                      }
                      {overview.variations.yearly.value >= 0 ? '+' : ''}
                      {formatCurrency(overview.variations.yearly.value)}{' '}
                      ({overview.variations.yearly.percentage >= 0 ? '+' : ''}
                      {overview.variations.yearly.percentage.toFixed(2)}%) YTD
                    </span>
                  )}
                </div>

                {/* Area sparkline — last 12 months, edge-to-edge via -mx-[22px] */}
                {sparkline12m.length >= 2 && (
                  <>
                    <div className="-mx-[22px] mt-3" style={{ height: 68 }}>
                      <NetWorthSparkline
                        data={sparkline12m}
                        filled={true}
                        color="var(--chart-1)"
                        height={68}
                      />
                    </div>
                    <div className="flex justify-between mt-1 mb-3 px-px text-[10px] text-muted-foreground font-mono">
                      <span>{cachedFormatCurrencyEUR(sparkline12m[0].totalNetWorth, true)}</span>
                      <span>{cachedFormatCurrencyEUR(sparkline12m[sparkline12m.length - 1].totalNetWorth, true)}</span>
                    </div>
                  </>
                )}

                <p className="text-[11px] text-muted-foreground mt-2.5">
                  {(overview?.flags.assetCount ?? 0) === 0
                    ? 'Aggiungi asset per iniziare'
                    : `${overview?.flags.assetCount ?? 0} asset in portafoglio`}
                </p>

                {/* ── TER + Costo Annuale — desktop only, pinned to bottom of hero card ── */}
                {(overview?.flags.hasTERTracking || overview?.flags.hasStampDuty) && (() => {
                  const annualTotal = (overview.metrics.annualPortfolioCost ?? 0) + (overview.metrics.annualStampDuty ?? 0);
                  const bothPresent = overview.flags.hasTERTracking && overview.flags.hasStampDuty;
                  return (
                    <div className="hidden desktop:grid grid-cols-2 gap-4 mt-auto pt-4 border-t border-border">
                      {overview.flags.hasTERTracking && (
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                            TER Medio Ponderato
                          </p>
                          <p className="text-[28px] font-bold font-mono tabular-nums tracking-[-0.03em] text-foreground leading-none">
                            {overview.metrics.portfolioTER.toFixed(2)}%
                          </p>
                        </div>
                      )}
                      <div className={cn(!overview.flags.hasTERTracking && 'col-span-2')}>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                          Costo Annuale Stimato
                        </p>
                        <p className="text-[28px] font-bold font-mono tabular-nums tracking-[-0.03em] text-amber-500 dark:text-amber-400 leading-none">
                          {formatCurrency(annualTotal)}
                        </p>
                        {bothPresent && (
                          <div className="mt-2 pt-2 border-t border-border divide-y divide-border">
                            <div className="flex justify-between py-[4px] text-[11px]">
                              <span className="text-muted-foreground">Costi di gestione (TER)</span>
                              <span className="font-mono tabular-nums text-foreground">
                                {formatCurrency(overview.metrics.annualPortfolioCost)}
                              </span>
                            </div>
                            <div className="flex justify-between py-[4px] text-[11px]">
                              <span className="text-muted-foreground">Imposta di bollo</span>
                              <span className="font-mono tabular-nums text-foreground">
                                {formatCurrency(overview.metrics.annualStampDuty)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </motion.div>

          {/* ── LIQUID CARD — redesigned: flat 3-row breakdown ── */}
          <motion.div layout="position" transition={springLayoutTransition} variants={cardItem}>
            <Card className="rounded-2xl h-full">
              <CardContent className="p-[22px]">
                <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                  Sintesi Patrimoniale
                </p>

                {/* 3-row breakdown + Patrimonio Totale Lordo footer */}
                <div className="pt-3 border-t border-border divide-y divide-border">
                  {[
                    {
                      label: 'Liquidità',
                      value: overview?.metrics.cashNetWorth ?? 0,
                      pct: totalValue > 0 ? ((overview?.metrics.cashNetWorth ?? 0) / totalValue) * 100 : 0,
                    },
                    {
                      label: 'Investimenti Liquidabili',
                      value: overview?.metrics.liquidInvestmentsNetWorth ?? 0,
                      pct: totalValue > 0 ? ((overview?.metrics.liquidInvestmentsNetWorth ?? 0) / totalValue) * 100 : 0,
                    },
                    {
                      label: 'Investimenti Illiquidi',
                      value: overview?.metrics.illiquidNetWorth ?? 0,
                      pct: totalValue > 0 ? ((overview?.metrics.illiquidNetWorth ?? 0) / totalValue) * 100 : 0,
                    },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-[7px]">
                      <span className="text-[14px] text-muted-foreground">{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-mono tabular-nums text-foreground">
                          {cachedFormatCurrencyEUR(row.value)}
                        </span>
                        <span className="text-[12px] font-mono tabular-nums text-muted-foreground w-[42px] text-right">
                          {row.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Bottom row: Patrimonio Totale Lordo (bold) */}
                  <div className="flex items-center justify-between py-[7px]">
                    <span className="text-[14px] font-semibold text-foreground">Patrimonio Totale Lordo</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-bold font-mono tabular-nums text-foreground">
                        {cachedFormatCurrencyEUR(totalValue)}
                      </span>
                      <span className="text-[12px] font-mono tabular-nums text-muted-foreground w-[42px] text-right">
                        100.0%
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── Fiscal rows — shown only when cost basis tracking is enabled ── */}
                {overview?.flags.hasCostBasisTracking && overview.metrics && (
                  <div className="mt-3 pt-3 border-t border-border divide-y divide-border">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground pb-2">
                      Impatto Fiscale
                    </p>
                    {[
                      {
                        label: 'Plusvalenze Non Realizzate',
                        value: overview.metrics.unrealizedGains,
                        className: overview.metrics.unrealizedGains >= 0
                          ? 'text-green-500 dark:text-green-400'
                          : 'text-red-500 dark:text-red-400',
                        prefix: overview.metrics.unrealizedGains >= 0 ? '+' : '',
                      },
                      {
                        label: 'Tasse Stimate',
                        value: overview.metrics.estimatedTaxes,
                        className: 'text-amber-500 dark:text-amber-400',
                        prefix: '',
                      },
                      {
                        label: 'Patrimonio Liquidabile Netto',
                        value: overview.metrics.liquidNetTotal,
                        className: 'text-foreground',
                        prefix: '',
                      },
                      {
                        label: 'Patrimonio Illiquido Netto',
                        value: overview.metrics.netTotal - overview.metrics.liquidNetTotal,
                        className: 'text-foreground',
                        prefix: '',
                      },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-[7px]">
                        <span className="text-[14px] text-muted-foreground">{row.label}</span>
                        <span className={cn('text-[14px] font-bold font-mono tabular-nums', row.className)}>
                          {row.prefix}{cachedFormatCurrencyEUR(row.value)}
                        </span>
                      </div>
                    ))}

                    {/* Concluding row: Pat. Netto Totale — styled prominently as the bottom-line figure */}
                    <div className="flex items-center justify-between py-[9px]">
                      <span className="text-[14px] font-semibold text-foreground">Pat. Netto Totale</span>
                      <span className="text-[14px] font-bold font-mono tabular-nums text-foreground">
                        {cachedFormatCurrencyEUR(overview.metrics.netTotal)}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

        </div>
      </motion.section>

      {/* ── TER + COSTO ANNUALE — 2-col row (both platforms) ── */}
      {(overview?.flags.hasTERTracking || overview?.flags.hasStampDuty) && (() => {
        const annualTotal = (overview.metrics.annualPortfolioCost ?? 0) + (overview.metrics.annualStampDuty ?? 0);
        const bothPresent = overview.flags.hasTERTracking && overview.flags.hasStampDuty;
        return (
          <motion.div
            layout="position"
            transition={springLayoutTransition}
            variants={cardItem}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-4 desktop:hidden"
          >
            {/* TER medio */}
            {overview.flags.hasTERTracking && (
              <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  TER Medio Ponderato
                </span>
                <div>
                  <p className="text-[32px] font-bold font-mono tabular-nums tracking-[-0.03em] text-foreground leading-none mt-3">
                    {overview.metrics.portfolioTER.toFixed(2)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Total Expense Ratio medio ponderato
                  </p>
                </div>
              </div>
            )}

            {/* Costo annuale */}
            <div className={cn(
              'bg-card border border-border rounded-2xl p-5 flex flex-col justify-between',
              !overview.flags.hasTERTracking && 'col-span-2'
            )}>
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Costo Annuale Stimato
              </span>
              <div>
                <p className="text-[32px] font-bold font-mono tabular-nums tracking-[-0.03em] text-amber-500 dark:text-amber-400 leading-none mt-3">
                  {formatCurrency(annualTotal)}
                </p>
                {bothPresent && (
                  <div className="mt-3 pt-3 border-t border-border space-y-0 divide-y divide-border">
                    <div className="flex justify-between py-[5px] text-[11px]">
                      <span className="text-muted-foreground">Costi di gestione (TER)</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(overview.metrics.annualPortfolioCost)}
                      </span>
                    </div>
                    <div className="flex justify-between py-[5px] text-[11px]">
                      <span className="text-muted-foreground">Imposta di bollo</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(overview.metrics.annualStampDuty)}
                      </span>
                    </div>
                  </div>
                )}
                {!bothPresent && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {overview.flags.hasTERTracking ? 'Costi di gestione annuali stimati' : 'Imposta di bollo annuale stimata'}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* ── CASHFLOW CARD ── */}
      {overview?.expenseStats && (() => {
        const { income, expenses, net } = overview.expenseStats.currentMonth;
        const { income: incomeDelta, expenses: expensesDelta } = overview.expenseStats.delta;
        const { month: italyMonth, year: italyYear } = getItalyMonthYear();
        const monthLabel = `${MONTH_NAMES_IT[italyMonth - 1].toUpperCase()} ${italyYear}`;

        return (
          <motion.div
            layout="position"
            transition={springLayoutTransition}
            variants={cardItem}
            initial="hidden"
            animate="visible"
          >
            <CashflowHeroCard
              monthLabel={monthLabel}
              income={income}
              expenses={expenses}
              net={net}
              ratio={coverageRatio}
              incomeDelta={incomeDelta}
              expensesDelta={expensesDelta}
              savingsRate={savingsRate}
              expenseCategories={overview.expenseStats.topExpenseCategories}
              incomeCategories={overview.expenseStats.topIncomeCategories}
              categories={expenseCategories}
              className="rounded-2xl"
            />
          </motion.div>
        );
      })()}
      {/* No cashflow data fallback */}
      {!overview?.expenseStats && (
        <motion.div
          layout="position"
          transition={springLayoutTransition}
          variants={cardItem}
          initial="hidden"
          animate="visible"
        >
          <Card className="rounded-2xl">
            <CardContent className="p-[22px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
                Cashflow
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Receipt className="h-4 w-4" />
                <span>Nessun dato questo mese</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── CHARTS SECTION ── */}
      <OverviewChartsSection
        sections={chartSections}
        heroSettled={heroSettled}
        isMobile={isMobile}
        prefersReducedMotion={!!prefersReducedMotion}
      />

      {/* ── SNAPSHOT CONFIRM DIALOG ── */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSnapshotDialogStyle(undefined);
          setShowConfirmDialog(nextOpen);
        }}
      >
        <DialogContent
          ref={snapshotDialogRef}
          style={snapshotDialogStyle}
          className="duration-300 data-[state=open]:zoom-in-90 data-[state=closed]:zoom-out-100 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 sm:max-w-md"
          showCloseButton={false}
        >
          <DialogHeader>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Snapshot mensile
            </p>
            <DialogTitle>Snapshot già esistente</DialogTitle>
            <DialogDescription>
              Esiste già uno snapshot per questo mese (
              {`${String(currentMonthReference.month).padStart(2, '0')}/${currentMonthReference.year}`}
              ). Vuoi sovrascriverlo con i dati attuali?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={creatingSnapshot}
            >
              Annulla
            </Button>
            <Button onClick={createSnapshot} disabled={creatingSnapshot}>
              {creatingSnapshot ? 'Creazione...' : 'Sovrascrivi'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Savings rate celebration badge */}
      {overview?.expenseStats && (
        <SavingsRateBadge
          previousMonthIncome={overview.expenseStats.previousMonth.income}
          previousMonthExpenses={overview.expenseStats.previousMonth.expenses}
        />
      )}
    </motion.div>
  );
}

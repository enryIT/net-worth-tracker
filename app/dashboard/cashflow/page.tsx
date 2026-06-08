/**
 * CASHFLOW PAGE
 *
 * Tab orchestration page for cashflow analysis with lazy loading.
 *
 * LAZY LOADING STRATEGY:
 * - Tabs mounted only when first activated (mountedTabs state tracking)
 * - Once mounted, tabs stay mounted (no unmounting on tab switch)
 * - Reduces initial page load time, improves perceived performance
 *
 * TAB STRUCTURE:
 * - Tracking: Current year's transactions and charts
 * - Current Year: Current year analysis
 * - Total History: All-time cashflow analysis
 * - Dividends: Dividend tracking
 *
 * WHY LAZY LOADING:
 * Each tab makes separate API calls and renders heavy charts.
 * Loading all tabs at once would cause ~3x longer initial load time.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { Receipt, Coins, BarChart3, Target, Layers, TrendingUp, Scale, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import dynamic from 'next/dynamic';
import { TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Dividend } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useHouseholdConfig } from '@/lib/hooks/useHousehold';
import { useAssets } from '@/lib/hooks/useAssets';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { tabPanelSwitch } from '@/lib/utils/motionVariants';
import { toast } from 'sonner';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageTabs } from '@/components/layout/PageTabs';
import type { TabDef } from '@/components/layout/PageTabs';

function CashflowTabLoading() {
  return <div className="h-48 rounded-md border bg-muted/30 animate-pulse" />;
}

const ExpenseTrackingTab = dynamic(
  () => import('@/components/cashflow/ExpenseTrackingTab').then((mod) => mod.ExpenseTrackingTab),
  { loading: CashflowTabLoading }
);
const CurrentYearTab = dynamic(
  () => import('@/components/cashflow/CurrentYearTab').then((mod) => mod.CurrentYearTab),
  { loading: CashflowTabLoading }
);
const TotalHistoryTab = dynamic(
  () => import('@/components/cashflow/TotalHistoryTab').then((mod) => mod.TotalHistoryTab),
  { loading: CashflowTabLoading }
);
const DividendTrackingTab = dynamic(
  () => import('@/components/dividends/DividendTrackingTab').then((mod) => mod.DividendTrackingTab),
  { loading: CashflowTabLoading }
);
const BudgetTab = dynamic(
  () => import('@/components/cashflow/BudgetTab').then((mod) => mod.BudgetTab),
  { loading: CashflowTabLoading }
);
const CostCentersTab = dynamic(
  () => import('@/components/cashflow/CostCentersTab').then((mod) => mod.CostCentersTab),
  { loading: CashflowTabLoading }
);
const CompensationsTab = dynamic(
  () => import('@/components/cashflow/CompensationsTab').then((mod) => mod.CompensationsTab),
  { loading: CashflowTabLoading }
);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Module-level constant: stable reference for React Compiler
// Analisi tab removed — it now lives at /dashboard/analisi as a standalone page.
const CASHFLOW_TABS_BASE: TabDef[] = [
  { value: 'tracking', label: 'Tracciamento', icon: Receipt },
  { value: 'dividends', label: 'Dividendi', icon: Coins },
  { value: 'current-year', label: 'Anno Corrente', icon: TrendingUp },
  { value: 'total-history', label: 'Storico Totale', icon: BarChart3 },
  { value: 'budget', label: 'Budget', icon: Target },
];

const VALID_CASHFLOW_TABS = [
  'tracking',
  'dividends',
  'current-year',
  'total-history',
  'budget',
  'compensations',
  'cost-centers',
] as const;
type CashflowTabId = (typeof VALID_CASHFLOW_TABS)[number];

function getInitialTab(param: string | null): CashflowTabId {
  return (VALID_CASHFLOW_TABS as readonly string[]).includes(param ?? '') ? (param as CashflowTabId) : 'tracking';
}

export default function CashflowPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialTab = getInitialTab(searchParams.get('tab'));
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set([initialTab]));
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  // null = settings not yet loaded (avoids the tab appearing late after an async flip from false → true)
  const [costCentersEnabled, setCostCentersEnabled] = useState<boolean | null>(null);

  // React Query hooks for expenses and categories
  const { data: allExpenses = [], isLoading: expensesLoading } = useExpenses(user?.uid);
  const { data: categories = [], isLoading: categoriesLoading } = useExpenseCategories(user?.uid);
  const { data: householdConfig, isLoading: householdLoading } = useHouseholdConfig(user?.uid);
  const householdEnabled = householdConfig?.enabled === true;
  const { data: allAssets = [] } = useAssets(user?.uid);

  const assetNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of allAssets) map.set(a.id, a.name);
    return map;
  }, [allAssets]);

  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(new Date().getFullYear() - 1);

  // Manual state for other tabs data (dividends, assets)
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [otherDataLoading, setOtherDataLoading] = useState(false);
  const [otherDataLoaded, setOtherDataLoaded] = useState(false);

  const loading = expensesLoading || categoriesLoading || otherDataLoading;
  const isDemo = useDemoMode();

  // Load dividends and assets only when their tabs are mounted
  const loadOtherData = async (force = false) => {
    if (!user || (!force && otherDataLoaded)) return;

    try {
      setOtherDataLoading(true);

      // Fetch only dividends and assets (expenses/categories handled by React Query)
      const [dividendsData, assetsData] = await Promise.all([
        authenticatedFetch(`/api/dividends?userId=${user.uid}`)
          .then(r => r.json())
          .then(d => d.dividends || []),
        getAllAssets(user.uid),
      ]);

      setDividends(dividendsData);
      // Include equity and bonds: bonds have coupons tracked as dividend entries
      setAssets(assetsData.filter(a => a.assetClass === 'equity' || a.assetClass === 'bonds'));
      setOtherDataLoaded(true);
    } catch (error) {
      console.error('Failed to load cashflow secondary data', {
        userId: user.uid,
        operation: 'loadOtherData',
        error: getErrorMessage(error),
      });
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setOtherDataLoading(false);
    }
  };

  useEffect(() => {
    const needsOtherData = mountedTabs.has('dividends');
    if (user && needsOtherData && !otherDataLoaded) {
      loadOtherData();
    }
  }, [user, mountedTabs, otherDataLoaded]);

  useEffect(() => {
    if (!householdLoading && !householdEnabled && activeTab === 'compensations') {
      setActiveTab('tracking');
    }
  }, [activeTab, householdEnabled, householdLoading]);

  // Load cashflow history start year from user settings (one-time read per session)
  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      try {
        const settings = await getSettings(user.uid);

        if (settings?.cashflowHistoryStartYear !== undefined) {
          setCashflowHistoryStartYear(settings.cashflowHistoryStartYear);
        }
        setCostCentersEnabled(settings?.costCentersEnabled ?? false);
      } catch (error) {
        // Settings bootstrap is non-fatal for the page: keep safe defaults and log explicitly.
        console.error('Failed to load cashflow settings, using fallback defaults', {
          userId: user.uid,
          operation: 'loadCashflowSettings',
          fallbackHistoryStartYear: 2025,
          fallbackCostCentersEnabled: false,
          error: getErrorMessage(error),
        });
        setCostCentersEnabled(false);
      }
    };

    void loadSettings();
  }, [user]);

  const handleRefresh = async () => {
    // Invalidate React Query caches for expenses and categories
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.all(user?.uid || ''),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.categories(user?.uid || ''),
    });

    // Force re-fetch of other data (dividends, assets)
    setOtherDataLoaded(false);
    await loadOtherData(true);
  };

  const handleTabChange = (value: string) => {
    if (value === 'compensations' && !householdEnabled) return;
    if (value === 'cost-centers' && costCentersEnabled === false) return;
    setActiveTab(value);
    setMountedTabs(prev => new Set(prev).add(value));
    router.replace(`${pathname}?tab=${value}`, { scroll: false });
  };

  // Canonicalize the URL on mount only when the tab param is absent or invalid
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== initialTab) {
      router.replace(`${pathname}?tab=${initialTab}`, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!householdLoading && !householdEnabled && activeTab === 'compensations') {
      setActiveTab('tracking');
      setMountedTabs((prev) => new Set(prev).add('tracking'));
      router.replace(`${pathname}?tab=tracking`, { scroll: false });
    }
    if (costCentersEnabled === false && activeTab === 'cost-centers') {
      setActiveTab('tracking');
      setMountedTabs((prev) => new Set(prev).add('tracking'));
      router.replace(`${pathname}?tab=tracking`, { scroll: false });
    }
  }, [activeTab, householdEnabled, householdLoading, costCentersEnabled, pathname, router]);

  const allTabs: TabDef[] = [
    ...CASHFLOW_TABS_BASE,
    ...(householdEnabled ? [{ value: 'compensations', label: 'Compensazioni', icon: Scale }] : []),
    ...(costCentersEnabled ? [{ value: 'cost-centers', label: 'Centri di Costo', icon: Layers }] : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        label="Operatività"
        title="Cashflow"
        description="Traccia e analizza le tue entrate e uscite nel tempo"
        separator={false}
        actions={
          <div className="flex items-center gap-2">
            {activeTab === 'tracking' && (
              <Button
                size="sm"
                disabled={isDemo}
                aria-label={isDemo ? 'Nuova Spesa — non disponibile in modalità demo' : 'Nuova Spesa'}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                onClick={() => window.dispatchEvent(new CustomEvent('cashflow:add-expense'))}
                className="hidden desktop:flex"
              >
                <Plus className="h-4 w-4" />
                Nuova Spesa
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              asChild
              aria-label="Impostazioni Spese"
            >
              <Link href="/dashboard/settings?tab=spese">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />

      <PageTabs
        tabs={allTabs}
        value={activeTab}
        onValueChange={handleTabChange}
        layoutId="cashflow-tab"
        loading={costCentersEnabled === null}
      >

        <TabsContent value="tracking" forceMount>
          <motion.div
            initial={false}
            animate={activeTab === 'tracking' ? 'visible' : 'hidden'}
            variants={tabPanelSwitch}
          >
            <ExpenseTrackingTab
              allExpenses={allExpenses}
              categories={categories}
              loading={loading}
              onRefresh={handleRefresh}
              assetNameMap={assetNameMap}
            />
          </motion.div>
        </TabsContent>

        {mountedTabs.has('dividends') && (
          <TabsContent value="dividends" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'dividends' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <DividendTrackingTab
                dividends={dividends}
                assets={assets}
                loading={loading}
                onRefresh={handleRefresh}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('current-year') && (
          <TabsContent value="current-year" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'current-year' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CurrentYearTab
                allExpenses={allExpenses}
                loading={loading}
                onRefresh={handleRefresh}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('total-history') && (
          <TabsContent value="total-history" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'total-history' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <TotalHistoryTab
                allExpenses={allExpenses}
                loading={loading}
                onRefresh={handleRefresh}
                historyStartYear={cashflowHistoryStartYear}
              />
            </motion.div>
          </TabsContent>
        )}

        {mountedTabs.has('budget') && (
          <TabsContent value="budget" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'budget' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <BudgetTab
                allExpenses={allExpenses}
                categories={categories}
                loading={loading}
                historyStartYear={cashflowHistoryStartYear}
                userId={user?.uid ?? ''}
              />
            </motion.div>
          </TabsContent>
        )}
        {householdEnabled && mountedTabs.has('compensations') && (
          <TabsContent value="compensations" className="mt-6" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'compensations' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CompensationsTab
                allExpenses={allExpenses}
                loading={loading}
                historyStartYear={cashflowHistoryStartYear}
              />
            </motion.div>
          </TabsContent>
        )}
        {costCentersEnabled && mountedTabs.has('cost-centers') && (
          <TabsContent value="cost-centers" forceMount>
            <motion.div
              initial={false}
              animate={activeTab === 'cost-centers' ? 'visible' : 'hidden'}
              variants={tabPanelSwitch}
            >
              <CostCentersTab />
            </motion.div>
          </TabsContent>
        )}
      </PageTabs>
    </PageContainer>
  );
}

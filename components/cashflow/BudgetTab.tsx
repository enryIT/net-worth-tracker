'use client';

/**
 * Budget tab — opt-in budgets with overall ceiling, income targets, end-of-month
 * forecast, insights and threshold alerts (issue #148).
 *
 * Budgets are created explicitly (no per-category auto-fill) and persisted via
 * debounced auto-save (useBudgetConfig). The overall budget validates that the
 * sum of category budgets stays within it. Alerts also surface in the monthly
 * summary email (lib/server/monthlyEmailService.ts).
 */

import { useEffect, useMemo, useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Expense, ExpenseCategory } from '@/types/expenses';
import { BudgetItem } from '@/types/budget';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useBudgetConfig, BudgetSaveStatus } from '@/lib/hooks/useBudgetConfig';
import { useHouseholdConfig } from '@/lib/hooks/useHousehold';
import {
  getAssignableOwnershipProfiles,
  isHouseholdEnabled,
  profileToAssignment,
} from '@/lib/utils/householdUtils';
import {
  buildBudgetInsights,
  buildSpendingForecast,
  evaluateBudgetAlerts,
  getPeriodActual,
  getMonthlyTotalExpenses,
  getOverallMonthlyBaseline,
} from '@/lib/utils/budgetUtils';
import { getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';
import { BudgetItemDialog } from '@/components/cashflow/budget/BudgetItemDialog';
import { BudgetSettingsCard } from '@/components/cashflow/budget/BudgetSettingsCard';
import { BudgetForecastCard } from '@/components/cashflow/budget/BudgetForecastCard';
import { BudgetInsightsCard } from '@/components/cashflow/budget/BudgetInsightsCard';
import { BudgetAlertsBanner } from '@/components/cashflow/budget/BudgetAlertsBanner';
import { BudgetList } from '@/components/cashflow/budget/BudgetList';

interface BudgetTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  historyStartYear: number;
  userId: string;
}

const SAVE_STATUS_LABEL: Record<BudgetSaveStatus, string | null> = {
  idle: null,
  saving: 'Salvataggio…',
  saved: 'Salvato',
  invalid: 'Oltre il budget complessivo',
  error: 'Errore di salvataggio',
};

export function BudgetTab({ allExpenses, categories, loading, historyStartYear, userId }: BudgetTabProps) {
  const isDemo = useDemoMode();
  const budget = useBudgetConfig({ userId, categories, disabled: isDemo });
  const { data: householdConfig } = useHouseholdConfig(userId);
  const householdEnabled = isHouseholdEnabled(householdConfig);
  const householdProfiles = useMemo(
    () => (householdEnabled ? getAssignableOwnershipProfiles(householdConfig) : []),
    [householdConfig, householdEnabled]
  );
  const [selectedAttributionProfileId, setSelectedAttributionProfileId] = useState('__all__');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);

  // Evaluated once per mount — the budget month is the current Italy month.
  const now = useMemo(() => new Date(), []);
  const year = getItalyYear(now);
  const month = getItalyMonth(now);

  useEffect(() => {
    if (!householdEnabled && selectedAttributionProfileId !== '__all__') {
      setSelectedAttributionProfileId('__all__');
    }
  }, [householdEnabled, selectedAttributionProfileId]);

  const budgetViewItems = useMemo(() => {
    if (selectedAttributionProfileId === '__all__') return budget.items;
    const profile = householdProfiles.find((item) => item.id === selectedAttributionProfileId);
    if (!profile) return budget.items;
    const assignment = profileToAssignment(profile);
    return budget.items.map((item) => ({
      ...item,
      attributionProfileId: assignment.profileId,
      attributionProfileName: assignment.profileName,
      attributionSplits: assignment.splits,
    }));
  }, [budget.items, householdProfiles, selectedAttributionProfileId]);

  const expenseItems = useMemo(
    () => budgetViewItems.filter((i) => i.kind === 'expense'),
    [budgetViewItems]
  );

  // Period actual per item: current month for monthly budgets, YTD for annual.
  const actualById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of budgetViewItems) {
      map[item.id] = getPeriodActual(item, allExpenses, now);
    }
    return map;
  }, [budgetViewItems, allExpenses, now]);

  const overallForecast = useMemo(() => {
    if (budget.overallMonthlyAmount == null) return null;
    // Overall budget tracks ALL month spending, not just the budgeted categories.
    const overallSpent = getMonthlyTotalExpenses(allExpenses, year, month);
    const reference = getOverallMonthlyBaseline(allExpenses, year);
    return buildSpendingForecast(overallSpent, budget.overallMonthlyAmount, now, reference);
  }, [budget.overallMonthlyAmount, allExpenses, year, month, now]);

  const insights = useMemo(
    () => buildBudgetInsights(expenseItems, allExpenses, now),
    [expenseItems, allExpenses, now]
  );

  const alerts = useMemo(
    () =>
      budget.alertsEnabled
        ? evaluateBudgetAlerts(expenseItems, budget.overallMonthlyAmount, allExpenses, budget.alertThresholds, now)
        : [],
    [budget.alertsEnabled, expenseItems, budget.overallMonthlyAmount, budget.alertThresholds, allExpenses, now]
  );

  function openCreate() {
    setEditingItem(null);
    setDialogOpen(true);
  }

  function openEdit(item: BudgetItem) {
    setEditingItem(item);
    setDialogOpen(true);
  }

  if (loading || budget.loading) {
    return (
      <div className="space-y-4">
        <div className="h-16 rounded-xl bg-muted animate-pulse" />
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
        <div className="h-64 rounded-xl bg-muted animate-pulse" />
      </div>
    );
  }

  const saveLabel = SAVE_STATUS_LABEL[budget.saveStatus];
  const hasItems = budgetViewItems.length > 0;

  return (
    <div className="space-y-4 max-desktop:portrait:pb-20">
      <div className="flex items-center justify-between gap-3">
        <div className="min-h-[20px] text-xs text-muted-foreground" role="status" aria-live="polite">
          {saveLabel && (
            <span className={budget.saveStatus === 'invalid' || budget.saveStatus === 'error' ? 'text-destructive' : ''}>
              {saveLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {householdEnabled && householdProfiles.length > 1 && (
            <Select value={selectedAttributionProfileId} onValueChange={setSelectedAttributionProfileId}>
              <SelectTrigger className="h-9 w-[190px] text-sm">
                <SelectValue placeholder="Attribuzione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutte le attribuzioni</SelectItem>
                {householdProfiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            onClick={openCreate}
            disabled={isDemo}
            aria-label={isDemo ? 'Aggiungi budget — non disponibile in modalità demo' : 'Aggiungi budget'}
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Aggiungi budget
          </Button>
        </div>
      </div>

      <BudgetSettingsCard
        overallMonthlyAmount={budget.overallMonthlyAmount}
        alertsEnabled={budget.alertsEnabled}
        alertThresholds={budget.alertThresholds}
        validation={budget.validation}
        isDemo={isDemo}
        onOverallChange={budget.setOverall}
        onAlertsEnabledChange={budget.setAlertsEnabled}
        onAlertThresholdsChange={budget.setAlertThresholds}
      />

      {budget.alertsEnabled && <BudgetAlertsBanner alerts={alerts} />}

      {hasItems ? (
        <>
          {(overallForecast || insights.topCategory || insights.categoriesAtRisk.length > 0) && (
            <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
              {overallForecast && <BudgetForecastCard forecast={overallForecast} />}
              <BudgetInsightsCard insights={insights} />
            </div>
          )}

          <BudgetList
            items={budgetViewItems}
            categories={categories}
            actualById={actualById}
            isDemo={isDemo}
            onEdit={openEdit}
            onDelete={budget.deleteItem}
          />
        </>
      ) : (
        <Card className="p-10 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nessun budget impostato</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea il tuo primo budget per categoria o un obiettivo di entrata.
          </p>
          <Button onClick={openCreate} disabled={isDemo} className="mt-4 inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            Aggiungi budget
          </Button>
        </Card>
      )}

      {dialogOpen && (
        <BudgetItemDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          categories={categories}
          allExpenses={allExpenses}
          historyStartYear={historyStartYear}
          existingItems={budget.items}
          overallMonthlyAmount={budget.overallMonthlyAmount}
          editingItem={editingItem}
          onSubmit={budget.upsertItem}
        />
      )}
    </div>
  );
}

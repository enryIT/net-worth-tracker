'use client';

/**
 * CostCentersTab
 *
 * Root component for the "Centri di Costo" tab in the Cashflow page.
 *
 * UX FLOW:
 * 1. List view — shows all cost centers as summary cards with lifetime KPIs
 * 2. Detail view — drill-down for a single cost center (chart + transaction table)
 *
 * WHY client-side KPI aggregation:
 * We pre-fetch all expenses for every cost center upfront and compute stats here
 * rather than making N separate Firestore queries (one per cost center). For a
 * typical user with 2-10 cost centers and a few hundred linked expenses each, the
 * total data volume is manageable in memory and avoids waterfall loading.
 *
 * NOTE: The feature toggle (costCentersEnabled) is checked in cashflow/page.tsx —
 * this component does not re-check it; it can assume it is only rendered when enabled.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { queryKeys } from '@/lib/query/queryKeys';
import { CostCenter } from '@/types/costCenters';
import {
  getCostCenters,
  getExpensesForCostCenter,
  deleteCostCenter,
} from '@/lib/services/costCenterService';
import { formatCurrency } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CostCenterDialog } from './CostCenterDialog';
import { CostCenterDetail } from './CostCenterDetail';
import { toast } from 'sonner';

// Per-center lifetime stats loaded after the list is fetched
interface CenterStats {
  totalSpent: number;
  transactionCount: number;
  averageMonthly: number;
}

export function CostCentersTab() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();

  // List + per-center spend stats live in React Query so expense mutations elsewhere
  // (ExpenseDialog in the Monitoraggio tab) can refresh this tab via cache invalidation.
  // Without this, the tab stays force-mounted and only re-fetched on a full page reload.
  const { data, isLoading: loading } = useQuery({
    queryKey: queryKeys.costCenters.all(user?.uid ?? ''),
    enabled: !!user,
    queryFn: async () => {
      const userId = user!.uid;
      const centers = await getCostCenters(userId);

      // Load lifetime KPIs for each center in parallel
      const statsEntries = await Promise.all(
        centers.map(async (center) => {
          const expenses = await getExpensesForCostCenter(userId, center.id);
          const outgoing = expenses.filter(e => e.amount < 0);
          const totalSpent = outgoing.reduce((sum, e) => sum + Math.abs(e.amount), 0);
          const monthKeys = new Set(
            outgoing.map(e => {
              const d = toDate(e.date);
              return `${d.getFullYear()}-${d.getMonth()}`;
            })
          );
          const activeMonths = monthKeys.size || 1;
          return [
            center.id,
            {
              totalSpent,
              transactionCount: outgoing.length,
              averageMonthly: totalSpent / activeMonths,
            },
          ] as [string, CenterStats];
        })
      );
      return { centers, stats: Object.fromEntries(statsEntries) as Record<string, CenterStats> };
    },
  });

  const costCenters = data?.centers ?? [];
  const centerStats = data?.stats ?? {};

  const invalidateCostCenters = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(user?.uid ?? '') });

  // Drill-down: the center currently being viewed (null = list view)
  const [selectedCenter, setSelectedCenter] = useState<CostCenter | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);

  const handleOpenCreate = () => {
    setEditingCenter(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (center: CostCenter) => {
    setEditingCenter(center);
    setDialogOpen(true);
  };

  const handleDialogSuccess = (saved: CostCenter) => {
    // Keep the open detail view in sync with the just-saved name/color
    if (selectedCenter?.id === saved.id) {
      setSelectedCenter(saved);
    }
    invalidateCostCenters();
  };

  const handleDelete = async (center: CostCenter) => {
    if (!user) return;
    try {
      await deleteCostCenter(user.uid, center.id);
      toast.success(`"${center.name}" eliminato`);
      setSelectedCenter(null);
      invalidateCostCenters();
    } catch (error) {
      console.error('Error deleting cost center:', error);
      toast.error('Errore durante l\'eliminazione');
    }
  };

  // Detail view
  if (selectedCenter) {
    return (
      <>
        <CostCenterDetail
          costCenter={selectedCenter}
          onBack={() => setSelectedCenter(null)}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          isDemo={isDemo}
        />
        <CostCenterDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          costCenter={editingCenter}
          onSuccess={handleDialogSuccess}
        />
      </>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Centri di Costo</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Raggruppa le spese per oggetto o progetto e monitora il costo totale nel tempo
          </p>
        </div>
        <Button
            onClick={handleOpenCreate}
            disabled={isDemo}
            aria-label={isDemo ? 'Nuovo centro — non disponibile in modalità demo' : undefined}
            className="w-full sm:w-auto sm:shrink-0"
            size="sm"
          >
          <Plus className="h-4 w-4 mr-1" />
          Nuovo centro
        </Button>
      </div>

      {loading ? (
        // Skeleton grid while fetching
        <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-5 space-y-3">
                <div className="h-4 bg-muted rounded w-1/2" />
                <div className="h-6 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : costCenters.length === 0 ? (
        // Empty state
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center text-muted-foreground">
          <Layers className="h-10 w-10 opacity-30" />
          <div className="space-y-1">
            <p className="font-medium">Nessun centro di costo</p>
            <p className="text-sm">
              Crea il primo centro per raggruppare spese per oggetto o progetto (es. &quot;Automobile Dacia&quot;).
            </p>
          </div>
          <Button onClick={handleOpenCreate} disabled={isDemo} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Crea il primo centro
          </Button>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-3 gap-4">
            {costCenters.map((center, i) => {
              const stats = centerStats[center.id];
              return (
                <motion.div
                  key={center.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                >
                  <Card
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer hover:border-primary/50 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Apri ${center.name}`}
                    onClick={() => setSelectedCenter(center)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCenter(center);
                      }
                    }}
                  >
                    <CardContent className="p-5 space-y-3">
                      {/* Card header: color dot + name */}
                      <div className="flex items-center gap-2">
                        {center.color && (
                          <span
                            className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: center.color }}
                          />
                        )}
                        <p className="font-semibold truncate">{center.name}</p>
                      </div>

                      {/* Lifetime total */}
                      <p className="text-2xl font-bold">
                        {stats ? formatCurrency(stats.totalSpent) : '—'}
                      </p>

                      {/* Secondary KPIs */}
                      <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                        {stats && (
                          <>
                            <span>{stats.transactionCount} transazioni</span>
                            <span>·</span>
                            <span>{formatCurrency(stats.averageMonthly)} / mese</span>
                          </>
                        )}
                        {!stats && <span className="animate-pulse">Caricamento...</span>}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </AnimatePresence>
      )}

      <CostCenterDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        costCenter={editingCenter}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}

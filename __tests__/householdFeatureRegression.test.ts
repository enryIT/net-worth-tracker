import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('household feature regression guards', () => {
  it('passes the selected household scope to assistant streaming requests', () => {
    const clientSource = readRepoFile('components/assistant/AssistantPageClient.tsx');
    const routeSource = readRepoFile('app/api/ai/assistant/stream/route.ts');

    expect(clientSource).toContain('householdScope: scope');
    expect(routeSource).toContain('householdScope: body.householdScope');
  });

  it('does not show global performance metrics while scoped metrics are unresolved', () => {
    const source = readRepoFile('app/dashboard/performance/page.tsx');

    expect(source).not.toContain('const metrics = scopedMetrics ?? baseMetrics');
    expect(source).toContain('const metrics = isScoped ? scopedMetrics : baseMetrics');
  });

  it('applies household scope to the History page datasets', () => {
    const source = readRepoFile('app/dashboard/history/page.tsx');

    expect(source).toContain('useHouseholdScopeFilter');
    expect(source).toContain('filterSnapshotsByOwnershipScope');
    expect(source).toContain('filterExpensesByAttributionScope');
    expect(source).toContain('const displaySnapshots = householdEnabled ? scopedSnapshots : snapshots');
  });

  it('exposes archive and restore actions for custom ownership profiles in settings', () => {
    const source = readRepoFile('app/dashboard/settings/page.tsx');

    expect(source).toContain('onClick={() => handleArchiveOwnershipProfile(profile.id)}');
    expect(source).toContain('onClick={() => handleRestoreOwnershipProfile(profile.id)}');
  });

  it('defaults legacy income edits to the configured income attribution profile', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toContain(
      "expense.attributionProfileId || (expense.type === 'income' ? defaultIncomeAttributionProfileId : defaultExpenseAttributionProfileId)"
    );
  });

  it('keeps the expense dialog ownership selector reachable in the cashflow form', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toContain("const watchedAttributionProfileId = useWatch({ control, name: 'attributionProfileId' });");
    expect(source).toContain('Label htmlFor="attributionProfileId"');
    expect(source).toContain('value={watchedAttributionProfileId || DEFAULT_PROFILE_SELF_ID}');
    expect(source).toContain('householdProfiles.map((profile) => (');
  });

  it('uses an overlay dialog, not an always-visible inline card, for investment buy/sell operations', () => {
    const source = readRepoFile('components/cashflow/InvestmentOperationsTab.tsx');

    expect(source).toContain('operationDialogOpen');
    expect(source).toContain('open={operationDialogOpen}');
    expect(source).toContain("onClick={() => openOperationDialog()}");
  });

  it('derives Patrimonio hero cards from scoped assets when Vista patrimonio is filtered', () => {
    const source = readRepoFile('app/dashboard/assets/page.tsx');

    expect(source).toContain('const scopedPortfolioMetrics = useMemo(');
    expect(source).toContain('const totalValue = scopedPortfolioMetrics.totalValue;');
    expect(source).toContain('const liquidNetTotal = scopedPortfolioMetrics.liquidNetTotal;');
    expect(source).not.toContain('const totalValue = overview?.metrics.totalValue ?? 0;');
    expect(source).not.toContain('const liquidNetTotal = overview?.metrics.liquidNetTotal ?? 0;');
  });
});

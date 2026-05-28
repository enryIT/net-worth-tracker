import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('cashflow UI regression guards', () => {
  it('keeps CurrentYearTab chart data hooks outside conditional render branches', () => {
    const source = readRepoFile('components/cashflow/CurrentYearTab.tsx');

    expect(source).not.toMatch(
      /monthFilteredExpenses\.length > 0 && \(\(\) => \{[\s\S]*useMemo/
    );
  });

  it('keeps CurrentYearTab period controls visible when the selected attribution has no current-year records', () => {
    const source = readRepoFile('components/cashflow/CurrentYearTab.tsx');

    expect(source).not.toContain('{currentYearExpenses.length > 0 && (');
    expect(source).toContain('Nessuna transazione trovata per il ${currentYear}');
  });

  it('keeps TotalHistoryTab attribution controls visible when the selected attribution has no records', () => {
    const source = readRepoFile('components/cashflow/TotalHistoryTab.tsx');

    expect(source).not.toMatch(/if \(scopedExpenses\.length === 0\)/);
  });

  it('allows changing the cashflow entry type while editing', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).not.toContain('disabled={!!expense}');
    expect(source).not.toContain('Il tipo di voce non può essere modificato');
  });

  it('resets hidden recurrence and installment flags when editing a cashflow entry', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');
    const editResetMatch = source.match(/if \(expense\) \{\s*reset\(\{([\s\S]*?)\}\);/);

    expect(editResetMatch?.[1]).toContain('isRecurring: expense.isRecurring || false');
    expect(editResetMatch?.[1]).toContain('isInstallment: expense.isInstallment || false');
    expect(editResetMatch?.[1]).toContain("installmentMode: 'auto'");
    expect(editResetMatch?.[1]).toContain('installmentCount: expense.installmentTotal || 2');
    expect(editResetMatch?.[1]).toContain('installmentTotalAmount: expense.installmentTotalAmount || Math.abs(expense.amount)');
    expect(editResetMatch?.[1]).toContain('linkedInvestmentAssetName: expense.linkedInvestmentAssetName');
    expect(editResetMatch?.[1]).toContain('investmentOperationPricePerUnit: expense.investmentOperationPricePerUnit');
  });

  it('guards edit reset to run once per open target and clears the guard on close', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toContain('const resetGuardRef = useRef<string | null>(null);');
    expect(source).toContain("const resetKey = expense ? `edit:${expense.id}` : 'create';");
    expect(source).toContain('if (resetGuardRef.current === resetKey) {');
    expect(source).toContain('resetGuardRef.current = null;');
  });

  it('keeps linked investment fields watched and submitted from form state in cashflow edits', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toContain("const watchedLinkedInvestmentAssetId = useWatch({ control, name: 'linkedInvestmentAssetId' });");
    expect(source).toContain("const watchedLinkedInvestmentAssetName = useWatch({ control, name: 'linkedInvestmentAssetName' });");
    expect(source).toContain("const watchedInvestmentOperationPricePerUnit = useWatch({ control, name: 'investmentOperationPricePerUnit' });");
    expect(source).toContain("const linkedInvestmentAssetId = watchedLinkedInvestmentAssetId !== '__none__' ? watchedLinkedInvestmentAssetId : undefined;");
    expect(source).toContain('await onSuccess?.();');
  });

  it('keeps expense edit submit path non-silent when validation fails', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toMatch(/const onInvalidSubmit(?:\s*:\s*[^=]+)?\s*=/);
    expect(source).toContain('toast.error(');
    expect(source).toContain('id="expense-form"');
    expect(source).toContain('noValidate');
    expect(source).toContain('onSubmit={handleSubmit(onSubmit, onInvalidSubmit)}');
    expect(source).toContain('type="button"');
    expect(source).toContain('onClick={handleSubmit(onSubmit, onInvalidSubmit)}');
    expect(source).not.toContain('type="submit" form="expense-form"');
  });

  it('keeps cashflow analysis tabs reachable and special operations inside tracking', () => {
    const pageSource = readRepoFile('app/dashboard/cashflow/page.tsx');
    const trackingSource = readRepoFile('components/cashflow/ExpenseTrackingTab.tsx');

    for (const value of ['current-year', 'total-history', 'compensations']) {
      expect(pageSource).toContain(`value: '${value}'`);
      expect(pageSource).toContain(`TabsContent value="${value}"`);
    }

    expect(pageSource).not.toContain("value: 'investments'");
    expect(pageSource).not.toContain("value: 'transfers'");
    expect(trackingSource).toContain("{ value: 'investment', label: 'Investimento' }");
    expect(trackingSource).toContain("{ value: 'transfer', label: 'Trasferimento' }");
  });

  it('keeps the household attribution settings tab reachable from settings navigation', () => {
    const source = readRepoFile('app/dashboard/settings/page.tsx');

    expect(source).toContain("{ value: 'household'");
    expect(source).toContain("label: 'Attribuzioni'");
    expect(source).toContain('TabsContent value="household"');
  });
});

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
    const editResetMatch = source.match(/if \(expense\) \{[\s\S]*?reset\(\{([\s\S]*?)\}\);/);

    expect(editResetMatch?.[1]).toContain('isRecurring: expense.isRecurring || false');
    expect(editResetMatch?.[1]).toContain('isInstallment: expense.isInstallment || false');
    expect(editResetMatch?.[1]).toContain("installmentMode: 'auto'");
    expect(editResetMatch?.[1]).toContain('installmentCount: expense.installmentTotal || 2');
    expect(editResetMatch?.[1]).toContain('installmentTotalAmount: expense.installmentTotalAmount || Math.abs(expense.amount)');
    expect(editResetMatch?.[1]).toContain("linkedInvestmentAssetName: typeof expense.linkedInvestmentAssetName === 'string'");
    expect(editResetMatch?.[1]).toContain('investmentOperationPricePerUnit: normalizeOptionalLinkedInvestmentNumber(expense.investmentOperationPricePerUnit)');
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

  it('normalizes nullable linked-investment numeric values in edit reset before they reach RHF state', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toContain('const normalizeOptionalLinkedInvestmentNumber = (value: unknown): number | undefined => {');
    expect(source).toContain('investmentOperationPricePerUnit: normalizeOptionalLinkedInvestmentNumber(expense.investmentOperationPricePerUnit)');
    expect(source).toContain('investmentOperationFees: normalizeOptionalLinkedInvestmentNumber(expense.investmentOperationFees)');
    expect(source).toContain('investmentOperationTaxes: normalizeOptionalLinkedInvestmentNumber(expense.investmentOperationTaxes)');
    expect(source).toContain('linkedInvestmentQuantityDelta: normalizeOptionalLinkedInvestmentQuantityDelta');
  });

  it('maps generic invalid-submit messages to explicit Italian feedback', () => {
    const source = readRepoFile('components/expenses/ExpenseDialog.tsx');

    expect(source).toContain("const fallbackInvalidSubmitMessage = 'Controlla i campi obbligatori prima di salvare';");
    expect(source).toContain("if (!errorMessage || errorMessage.trim().length === 0 || errorMessage === 'Invalid input') {");
    expect(source).toContain("return invalidFieldMessages[fieldName] ?? fallbackInvalidSubmitMessage;");
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

  it('includes dividend, fee, and tax rows in CSV import commit prep and keeps the confirmation copy current', () => {
    const source = readRepoFile('app/dashboard/cashflow/import-csv/page.tsx');

    expect(source).toContain("type CashflowCommitMovementKind = Exclude<ImportMovementKind, 'unknown'>;");
    expect(source).toContain('movementKind: CashflowCommitMovementKind;');
    expect(source).toContain("row.movementKind !== 'unknown'");
    expect(source).toContain("if (row.movementKind === 'dividend') {");
    expect(source).toContain("if (row.movementKind === 'cashflow' || row.movementKind === 'fee' || row.movementKind === 'tax') {");
    expect(source).toContain("if (row.movementKind === 'investmentOperation') {");
    expect(source).toContain("if (!row.canonicalFields.assetName && !row.canonicalFields.assetTicker && !row.canonicalFields.assetIsin) {");
    expect(source).toContain("movementKind: 'dividend',");
    expect(source).toContain("movementKind: row.movementKind,");
    expect(source).toContain('categoryId: null,');
    expect(source).toContain('categoryName: null,');
    expect(source).toContain('subCategoryId: null,');
    expect(source).toContain('subCategoryName: null,');
    expect(source).toContain('I movimenti cashflow ordinari, i transfer interni, le operazioni di investimento, i dividendi/cedole e le commissioni/imposte pronti vengono confermati in chunk da {CSV_IMPORT_COMMIT_CHUNK_SIZE} righe per mantenere il retry idempotente.');
    expect(source).toContain('Compila categorie per cashflow, fee e tax, conti dei transfer o riferimenti asset per operazioni di investimento e dividendi per abilitare la conferma.');
    expect(source).not.toContain('Milestone 6');
  });

  it('routes CSV import cache invalidation through the shared helper after commit and rollback', () => {
    const source = readRepoFile('app/dashboard/cashflow/import-csv/page.tsx');
    const helperStart = source.indexOf('const invalidateImportRelatedQueries = useCallback');
    const helperEnd = source.indexOf('const toggleReadyState = useCallback');
    const commitStart = source.indexOf('const handleCommitCashflowRows = useCallback');
    const rollbackBatchStart = source.indexOf('const rollbackImportBatch = useCallback');
    const rollbackRunStart = source.indexOf('const rollbackImportRun = useCallback');
    const rollbackWrapperStart = source.indexOf('const handleRollbackCommittedBatch = useCallback');

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(commitStart).toBeGreaterThan(helperEnd);
    expect(rollbackBatchStart).toBeGreaterThan(helperEnd);
    expect(rollbackRunStart).toBeGreaterThan(rollbackBatchStart);
    expect(rollbackWrapperStart).toBeGreaterThan(commitStart);

    const helperBlock = source.slice(helperStart, helperEnd);
    const commitBlock = source.slice(commitStart, rollbackWrapperStart);
    const rollbackBatchBlock = source.slice(rollbackBatchStart, rollbackRunStart);
    const rollbackRunBlock = source.slice(rollbackRunStart, commitStart);
    const expectedInvalidations = [
      'queryKeys.expenses.all(user.uid)',
      'queryKeys.expenses.stats(user.uid)',
      'queryKeys.assets.all(user.uid)',
      'queryKeys.assets.operations(user.uid)',
      'queryKeys.assets.realized(user.uid)',
      'queryKeys.assets.transfers(user.uid)',
      'queryKeys.dashboard.overview(user.uid)',
      'queryKeys.imports.history(user.uid)',
      'queryKeys.imports.runs(user.uid)',
    ];

    for (const invalidation of expectedInvalidations) {
      expect(helperBlock).toContain(invalidation);
    }

    expect(commitBlock).toContain('await invalidateImportRelatedQueries();');
    expect(rollbackBatchBlock).toContain('await invalidateImportRelatedQueries();');
    expect(rollbackRunBlock).toContain('await invalidateImportRelatedQueries();');
  });

  it('keeps the household attribution settings tab reachable from settings navigation', () => {
    const source = readRepoFile('app/dashboard/settings/page.tsx');

    expect(source).toContain("{ value: 'household'");
    expect(source).toContain("label: 'Attribuzioni'");
    expect(source).toContain('TabsContent value="household"');
  });
});

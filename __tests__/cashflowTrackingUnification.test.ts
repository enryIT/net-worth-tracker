import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('cashflow tracking unification', () => {
  it('keeps transfers and investment operations inside tracking instead of dedicated cashflow tabs', () => {
    const pageSource = readFileSync('app/dashboard/cashflow/page.tsx', 'utf8');

    expect(pageSource).not.toContain("value: 'investments'");
    expect(pageSource).not.toContain("value: 'transfers'");
    expect(pageSource).not.toContain('<InvestmentOperationsTab />');
    expect(pageSource).not.toContain('<InternalTransfersTab />');
  });

  it('exposes transfers and investment operations as movement types in tracking', () => {
    const trackingSource = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(trackingSource).toContain("{ value: 'investment', label: 'Investimento' }");
    expect(trackingSource).toContain("{ value: 'transfer', label: 'Trasferimento' }");
    expect(trackingSource).toContain('UnifiedMovementDialog');
    expect(trackingSource).toContain('MOVEMENT_TYPE_CARDS');
    expect(trackingSource).not.toContain('<InvestmentOperationsTab embedded />');
    expect(trackingSource).not.toContain('<InternalTransfersTab embedded />');
  });

  it('uses a roomy sectioned layout for investment and transfer movement forms', () => {
    const trackingSource = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');
    const roomyCards = trackingSource.match(/rounded-xl border bg-background p-4 desktop:p-5/g) ?? [];

    expect(trackingSource).not.toContain('grid gap-4 desktop:grid-cols-6 desktop:items-end');
    expect(trackingSource).toContain('space-y-6 rounded-xl border bg-muted/20 p-4 desktop:p-6');
    expect(trackingSource).toContain('Dettagli operazione');
    expect(trackingSource).toContain('Dettagli trasferimento');
    expect(trackingSource).toContain('grid gap-4 desktop:grid-cols-2');
    expect(roomyCards.length).toBeGreaterThanOrEqual(4);
  });
});

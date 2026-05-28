import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('cashflow unified movement form', () => {
  it('uses one movement entrypoint instead of embedding dedicated special-operation forms', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('Nuovo movimento');
    expect(source).toContain('UnifiedMovementDialog');
    expect(source).toContain('MOVEMENT_TYPE_CARDS');
    expect(source).not.toContain('<InvestmentOperationsTab embedded />');
    expect(source).not.toContain('<InternalTransfersTab embedded />');
    expect(source).not.toContain("from '@/components/cashflow/InvestmentOperationsTab'");
    expect(source).not.toContain("from '@/components/cashflow/InternalTransfersTab'");
  });

  it('keeps type-specific fields inside the unified movement dialog', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('movementKind');
    expect(source).toContain('assetId');
    expect(source).toContain('quantity');
    expect(source).toContain('pricePerUnit');
    expect(source).toContain('fromCashAssetId');
    expect(source).toContain('toCashAssetId');
    expect(source).toContain('purpose');
    expect(source).toContain('createInvestmentOperation');
    expect(source).toContain('createInternalTransfer');
  });

  it('unifies edit and delete actions for cashflow, investment, and transfer movements in one list', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('handleEditMovement');
    expect(source).toContain('handleDeleteMovement');
    expect(source).toContain("kind: 'investment'");
    expect(source).toContain("kind: 'transfer'");
    expect(source).toContain("kind: 'expense'");
    expect(source).not.toContain('Storico operazioni');
    expect(source).not.toContain('Storico trasferimenti');
  });

  it('keeps update wiring for investment and transfer edit flows', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('updateInvestmentOperation');
    expect(source).toContain('updateInternalTransfer');
    expect(source).toContain("await handleSaveInvestment(editingMovement?.kind === 'investment' ? editingMovement.source.id : undefined)");
    expect(source).toContain("await handleSaveTransfer(editingMovement?.kind === 'transfer' ? editingMovement.source.id : undefined)");
    expect(source).toContain('await updateInvestmentOperation(editingId, payload);');
    expect(source).toContain('await updateInternalTransfer(editingId, payload);');
  });

  it('awaits movement refresh before closing the dialog after save', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');
    const submitBlock = source.match(/const handleSubmit = async \(\) => \{([\s\S]*?)\n  \};/);

    expect(submitBlock?.[1]).toMatch(/await onSaved\(\);[\s\S]*closeDialog\(\);/);
  });

  it('keeps cashflow selection inside the unified movement dialog step flow', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');
    const selectKindBlock = source.match(/const handleSelectKind = \(kind: MovementKind\) => \{([\s\S]*?)\n  \};/);

    expect(selectKindBlock?.[1]).not.toContain('onCreateCashflow()');
    expect(source).toContain("movementKind === 'expense'");
    expect(source).toContain('Cambia tipo');
  });

  it('uses the wider dialog width standard for unified investment and transfer edits', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"');
  });
});

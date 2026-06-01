import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('csv import preview UI', () => {
  it('adds a dedicated entrypoint from cashflow tracking', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('Importa CSV');
    expect(source).toContain('/dashboard/cashflow/import-csv');
  });

  it('keeps the csv import page preview-only without commit action', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('Anteprima import CSV');
    expect(source).toContain('/api/imports/validate');
    expect(source).toContain('/api/imports/presets');
    expect(source).toContain('Preset import');
    expect(source).toContain('Salva preset');
    expect(source).toContain('Carica preset');
    expect(source).toContain('Aggiorna preset');
    expect(source).toContain('Elimina preset');
    expect(source).toContain('Nessun movimento viene salvato in questa fase');
    expect(source).not.toContain('Conferma importazione');
    expect(source).not.toContain('Importa definitivamente');
    expect(source).not.toContain('Salva movimenti');
    expect(source).not.toContain('/api/imports/commit');
  });
});

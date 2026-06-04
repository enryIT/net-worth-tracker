import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('csv import preview UI', () => {
  it('adds a dedicated entrypoint from cashflow tracking', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('Importa CSV');
    expect(source).toContain('/dashboard/cashflow/import-csv');
  });

  it('exposes the M7 commit and rollback action for ready dividend, fee, tax, cashflow, transfer, and investment rows', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('Anteprima import CSV');
    expect(source).toContain('/api/imports/validate');
    expect(source).toContain('/api/imports/presets');
    expect(source).toContain('/api/imports/commit');
    expect(source).toContain('Preset import');
    expect(source).toContain('Salva preset');
    expect(source).toContain('Carica preset');
    expect(source).toContain('Aggiorna preset');
    expect(source).toContain('Elimina preset');
    expect(source).toContain('I movimenti cashflow ordinari, i transfer interni, le operazioni di investimento, i dividendi/cedole e le commissioni/imposte pronti possono essere confermati in Milestone 7.');
    expect(source).toContain('Conferma importazione');
    expect(source).toContain('Annulla importazione batch');
    expect(source).toContain('Nessun movimento viene salvato in questa fase');
    expect(source).toContain("row.movementKind !== 'unknown'");
    expect(source).toContain("if (row.movementKind === 'dividend') {");
    expect(source).toContain("if (row.movementKind === 'cashflow' || row.movementKind === 'fee' || row.movementKind === 'tax') {");
  });

  it('shows import history and explicit rollback confirmation on the CSV import page', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('Storico import CSV');
    expect(source).toContain('I batch confermati e annullati restano disponibili qui con stato, conteggi e record creati.');
    expect(source).toContain('Annulla batch');
    expect(source).toContain('L&apos;annullamento rimuove solo i record creati da questo batch.');
    expect(source).toContain('Conferma annullamento');
    expect(source).toContain('Annullato il');
    expect(source).toContain('Record creati per tipo');
  });

  it('exposes the M3 wizard shell, filters, row correction, and assisted linking copy', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('Carica file CSV');
    expect(source).toContain('Il file grezzo viene elaborato nel browser e non viene salvato come CSV grezzo.');
    expect(source).toContain('Mappatura campi');
    expect(source).toContain('Campi obbligatori');
    expect(source).toContain('Campi facoltativi');
    expect(source).toContain('Classificazione e regole');
    expect(source).toContain('Anteprima e riconciliazione');
    expect(source).toContain('Filtri anteprima');
    expect(source).toContain('Solo errori');
    expect(source).toContain('Solo avvisi');
    expect(source).toContain('Duplicati');
    expect(source).toContain('Tipo movimento sconosciuto');
    expect(source).toContain('Riferimenti mancanti');
    expect(source).toContain('Correzione riga');
    expect(source).toContain('Modifica massiva');
    expect(source).toContain('Collegamento assistito');
    expect(source).toContain('Nessuna creazione automatica');
    expect(source).toContain('Le righe con errori bloccanti non possono essere marcate come pronte.');
    expect(source).toContain('processato nel browser');
  });
});

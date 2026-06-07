import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('csv import preview UI', () => {
  it('adds a dedicated entrypoint from cashflow tracking', () => {
    const source = readFileSync('components/cashflow/ExpenseTrackingTab.tsx', 'utf8');

    expect(source).toContain('Importa CSV');
    expect(source).toContain('/dashboard/cashflow/import-csv');
  });

  it('exposes the chunked commit and rollback action for ready dividend, fee, tax, cashflow, transfer, and investment rows', () => {
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
    expect(source).toContain('Conferma importazione movimenti');
    expect(source).toContain('vengono confermati in chunk da {CSV_IMPORT_COMMIT_CHUNK_SIZE} righe per mantenere il retry idempotente.');
    expect(source).toContain('Conferma importazione');
    expect(source).toContain('Annulla importazione batch');
    expect(source).toContain('Ultimo batch confermato: batch');
    expect(source).toContain('I chunk successivi sono stati interrotti.');
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
    expect(source).toContain('L&apos;annullamento rimuove solo i record creati da questo import raggruppato, inclusi tutti i chunk collegati.');
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

  it('keeps the default import locale aligned with short-year Italian bank and broker dates', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toMatch(/const DEFAULT_DATE_FORMATS = \['dd\/MM\/yyyy', 'dd\/MM\/yy', 'yyyy-MM-dd'\];/);
    expect(source.match(/dateFormats:\s*DEFAULT_DATE_FORMATS/g) ?? []).toHaveLength(2);
  });

  it('chunks ready commit rows with a fixed size and per-chunk idempotency keys', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toMatch(/const CSV_IMPORT_COMMIT_CHUNK_SIZE = 250;/);
    expect(source).toMatch(
      /function splitIntoCommitChunks<T>\(rows: T\[\], chunkSize: number\): T\[\]\[\] \{[\s\S]*if \(chunkSize <= 0\) \{[\s\S]*return \[rows\];[\s\S]*for \(let startIndex = 0; startIndex < rows\.length; startIndex \+= chunkSize\) \{[\s\S]*chunks\.push\(rows\.slice\(startIndex, startIndex \+ chunkSize\)\);[\s\S]*return chunks;[\s\S]*\}/
    );
    expect(source).toMatch(/function buildChunkIdempotencyKey\(baseIdempotencyKey: string, chunkIndex: number\): string \{/);
    expect(source).toMatch(
      /const commitChunks = splitIntoCommitChunks\(commitRows, CSV_IMPORT_COMMIT_CHUNK_SIZE\);[\s\S]*for \(let chunkIndex = 0; chunkIndex < commitChunks\.length; chunkIndex \+= 1\) \{[\s\S]*const chunkRows = commitChunks\[chunkIndex\];[\s\S]*const chunkIdempotencyKey = buildChunkIdempotencyKey\(baseIdempotencyKey, chunkIndex\);[\s\S]*rows: chunkRows,/
    );
    expect(source).not.toContain('rows: cashflowCommitPreparation.rows,');
  });

  it('paginates the preview table instead of mapping filteredRows directly', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toMatch(/const CSV_IMPORT_PREVIEW_PAGE_SIZE = \d+;/);
    expect(source).toContain('const paginatedPreviewRows = useMemo(');
    expect(source).toContain('filteredRows.slice(');
    expect(source).toContain('paginatedPreviewRows.map((row) => (');
    expect(source).not.toContain('filteredRows.length > 0 ? filteredRows.map((row) => (');
  });

  it('shows Italian pagination copy and keeps preview reset in the validation handlers', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('Pagina precedente');
    expect(source).toContain('Pagina successiva');
    expect(source).toContain('Pagina {previewPage} di {previewPageCount}');
    expect(source).toContain('setPreviewPage(1);');
    expect(source.match(/setPreviewPage\(1\);/g) ?? []).toHaveLength(2);
    expect(source).toContain('const previewPage = Math.min(previewPageState, previewPageCount);');
  });

  it('derives the visible preview page instead of clamping it in an effect', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('const previewPage = Math.min(previewPageState, previewPageCount);');
    expect(source).not.toContain('setPreviewPage((currentPage) => Math.min(currentPage, previewPageCount));');
    expect(source).not.toContain('setPreviewPage(1);\n  }, [preview]);');
    expect(source).not.toContain('setPreviewPage(1);\n  }, [previewPageCount]);');
  });

  it('keeps bulk selection and row correction wired to displayRows and filteredRows', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('displayRows.find((row) => row.rowIndex === selectedRowId) ?? displayRows[0] ?? null');
    expect(source).toContain('displayRows.map((row) => (');
    expect(source).toContain('selectedRowIds.includes(row.rowIndex)');
    expect(source).toContain('toggleBulkSelection(row.rowIndex)');
  });

  it('shows chunk progress and partial failure copy in the commit status area', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('Conferma importazione in corso');
    expect(source).toContain('chunk completati');
    expect(source).toContain('record creati totali');
    expect(source).toContain('Il chunk ${chunkNumber}/${commitChunks.length} è fallito dopo ${completedChunks} chunk già confermati');
    expect(source).toContain('Importazione interrotta');
    expect(source).toContain('I chunk successivi sono stati interrotti.');
  });

  it('exposes grouped import run history and explicit grouped rollback copy', () => {
    const source = readFileSync('app/dashboard/cashflow/import-csv/page.tsx', 'utf8');

    expect(source).toContain('importRunId');
    expect(source).toContain('/api/imports/runs');
    expect(source).toContain('Importazione raggruppata');
    expect(source).toContain('Chunk collegati');
    expect(source).toContain('Annulla importazione raggruppata');
    expect(source).toContain('Importazioni collegate');
  });
});

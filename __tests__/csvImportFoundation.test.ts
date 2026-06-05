import { describe, expect, it } from 'vitest';
import { parseCsvText } from '@/lib/server/imports/csvParser';
import { validateColumnMapping } from '@/lib/server/imports/mappingValidation';
import { normalizeMappedRow } from '@/lib/server/imports/normalization';
import { classifyImportRow } from '@/lib/server/imports/classification';
import { buildDedupeKeyForRow } from '@/lib/server/imports/dedupe';
import { buildCsvImportPreview } from '@/lib/server/imports/previewService';
import type {
  ClassificationConfidence,
  ImportColumnMapping,
  ImportMovementKind,
  LocaleNormalizationOptions,
  NormalizedImportRow,
} from '@/lib/server/imports/types';

const DEFAULT_LOCALE: LocaleNormalizationOptions = {
  dateFormats: ['dd/MM/yyyy', 'dd/MM/yy', 'yyyy-MM-dd'],
  decimalSeparator: ',',
  thousandsSeparator: '.',
  defaultCurrency: 'EUR',
};

function assertClassification(
  row: NormalizedImportRow,
  kind: ImportMovementKind,
  confidence: ClassificationConfidence
) {
  expect(row.movementKind).toBe(kind);
  expect(row.confidence).toBe(confidence);
  expect(typeof row.classificationReason).toBe('string');
  expect(row.classificationReason.length).toBeGreaterThan(0);
}

describe('csv import foundation', () => {
  it('detects delimiter and header shape from CSV text', () => {
    const parsed = parseCsvText([
      'Data;Descrizione;Importo',
      '31/05/2026;Stipendio;2.750,50',
      '30/05/2026;Spesa supermercato;-95,33',
    ].join('\n'));

    expect(parsed.delimiter).toBe(';');
    expect(parsed.hasHeader).toBe(true);
    expect(parsed.headers).toEqual(['Data', 'Descrizione', 'Importo']);
    expect(parsed.rows).toHaveLength(2);
  });

  it('validates mapping with blocking errors and warnings', () => {
    const mapping: ImportColumnMapping = {
      description: 'Descrizione',
      amount: 'Importo',
      debit: 'Addebito',
      credit: 'Accredito',
    };

    const validation = validateColumnMapping(['Descrizione', 'Importo'], mapping);

    expect(validation.blocking.some((issue) => issue.code === 'missing_required_mapping')).toBe(true);
    expect(validation.warnings.some((issue) => issue.code === 'conflicting_amount_mapping')).toBe(true);
  });

  it('normalizes locale-aware dates and deterministic signed amounts', () => {
    const mapping: ImportColumnMapping = {
      date: 'Data',
      description: 'Descrizione',
      debit: 'Addebito',
      credit: 'Accredito',
      currency: 'Valuta',
    };

    const debitRow = normalizeMappedRow({
      rowIndex: 1,
      sourceHeaders: ['Data', 'Descrizione', 'Addebito', 'Accredito', 'Valuta'],
      sourceValues: ['01/05/2026', 'Affitto', '1.250,00', '', 'eur'],
      mapping,
      locale: DEFAULT_LOCALE,
    });

    expect(debitRow.canonicalFields.date).toBe('2026-05-01');
    expect(debitRow.canonicalFields.amount).toBe(-1250);
    expect(debitRow.canonicalFields.currency).toBe('EUR');

    const creditRow = normalizeMappedRow({
      rowIndex: 2,
      sourceHeaders: ['Data', 'Descrizione', 'Addebito', 'Accredito'],
      sourceValues: ['02/05/2026', 'Rimborso', '0', '200,25'],
      mapping,
      locale: DEFAULT_LOCALE,
    });

    expect(creditRow.canonicalFields.amount).toBe(200.25);
  });

  it('classifies with deterministic kind, confidence, and human-readable reason', () => {
    const row: NormalizedImportRow = {
      rowIndex: 4,
      rawPreview: { Descrizione: 'CEDOLA ETF SWDA', Importo: '12,32' },
      canonicalFields: {
        date: '2026-05-10',
        description: 'CEDOLA ETF SWDA',
        amount: 12.32,
        currency: 'EUR',
        sourceType: 'cedola',
        sourceAccount: null,
        destinationAccount: null,
        assetTicker: 'SWDA',
        assetIsin: null,
        assetName: null,
        quantity: null,
        unitPrice: null,
        fees: null,
        taxes: null,
      },
      movementKind: 'unknown',
      confidence: 'low',
      classificationReason: '',
      dedupeStatus: 'unique',
      dedupeKey: '',
      issues: [],
    };

    const classified = classifyImportRow(row);
    assertClassification(classified, 'dividend', 'high');
    expect(classified.classificationReason.toLowerCase()).toContain('cedola');
  });

  it('builds stable dedupe keys for semantically equivalent rows', () => {
    const baseRow: NormalizedImportRow = {
      rowIndex: 1,
      rawPreview: {},
      canonicalFields: {
        date: '2026-05-03',
        description: '  Bonifico Interno  ',
        amount: -250,
        currency: 'EUR',
        sourceType: 'transfer',
        sourceAccount: ' Conto Principale ',
        destinationAccount: 'Conto Broker',
        assetTicker: null,
        assetIsin: null,
        assetName: null,
        quantity: null,
        unitPrice: null,
        fees: null,
        taxes: null,
      },
      movementKind: 'transfer',
      confidence: 'high',
      classificationReason: 'x',
      dedupeStatus: 'unique',
      dedupeKey: '',
      issues: [],
    };

    const equivalentRow: NormalizedImportRow = {
      ...baseRow,
      rowIndex: 2,
      canonicalFields: {
        ...baseRow.canonicalFields,
        description: 'bonifico   interno',
        sourceAccount: 'conto principale',
      },
    };

    expect(buildDedupeKeyForRow(baseRow)).toBe(buildDedupeKeyForRow(equivalentRow));
  });

  it('returns row-level blocking issues instead of throwing on invalid required fields', () => {
    const preview = buildCsvImportPreview({
      csvText: [
        'Data;Descrizione;Importo',
        ';Pagamento bolletta;-120,00',
        '01/05/2026;;abc',
      ].join('\n'),
      mapping: {
        date: 'Data',
        description: 'Descrizione',
        amount: 'Importo',
      },
      locale: DEFAULT_LOCALE,
    });

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.blockingRows).toBeGreaterThan(0);
    expect(preview.rows[0].issues.some((issue) => issue.severity === 'blocking')).toBe(true);
    expect(preview.rows[1].issues.some((issue) => issue.severity === 'blocking')).toBe(true);
  });

  it('handles a 5,000-row CSV in memory for preview validation', () => {
    const rows = Array.from({ length: 5000 }, (_, index) =>
      `${String((index % 28) + 1).padStart(2, '0')}/05/2026;Movimento ${index + 1};1,00`
    );
    const csvText = ['Data;Descrizione;Importo', ...rows].join('\n');

    const preview = buildCsvImportPreview({
      csvText,
      mapping: {
        date: 'Data',
        description: 'Descrizione',
        amount: 'Importo',
      },
      locale: DEFAULT_LOCALE,
    });

    expect(preview.summary.totalRows).toBe(5000);
    expect(preview.rows).toHaveLength(5000);
  });

  it('keeps a 5,000-row bank CSV valid with short-year Italian dates, quoted semicolons, and apostrophe thousands separators', () => {
    const bankLocale: LocaleNormalizationOptions = {
      ...DEFAULT_LOCALE,
      thousandsSeparator: "'",
    };
    const rows = Array.from({ length: 5001 }, (_, index) => (
      index === 0
        ? `01/05/26;"Ordine acquisto; broker diretto";1'234,56`
        : `02/05/25;Movimento ${index + 1};12,34`
    ));

    const preview = buildCsvImportPreview({
      csvText: ['Data;Descrizione;Importo', ...rows].join('\n'),
      mapping: {
        date: 'Data',
        description: 'Descrizione',
        amount: 'Importo',
      },
      locale: bankLocale,
    });

    expect(preview.summary.totalRows).toBe(5000);
    expect(preview.rows).toHaveLength(5000);
    expect(preview.summary.blockingRows).toBe(0);
    expect(preview.rows[0].canonicalFields.date).toBe('2026-05-01');
    expect(preview.rows[0].canonicalFields.amount).toBe(1234.56);
    expect(preview.rows[0].rawPreview.Descrizione).toBe('Ordine acquisto; broker diretto');
  });
});

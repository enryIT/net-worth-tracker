import { classifyImportRow } from '@/lib/server/imports/classification';
import { parseCsvText } from '@/lib/server/imports/csvParser';
import { buildDedupeKeyForRow } from '@/lib/server/imports/dedupe';
import { validateColumnMapping } from '@/lib/server/imports/mappingValidation';
import { normalizeMappedRow } from '@/lib/server/imports/normalization';
import type {
  CsvImportPreviewRequest,
  CsvImportPreviewResult,
  ImportIssue,
  ImportMovementKind,
  NormalizedImportRow,
} from '@/lib/server/imports/types';

const DEFAULT_MAX_ROWS = 5000;

function emptyByKindSummary(): Record<ImportMovementKind, number> {
  return {
    cashflow: 0,
    transfer: 0,
    investmentOperation: 0,
    dividend: 0,
    fee: 0,
    tax: 0,
    unknown: 0,
  };
}

function dedupeRows(rows: NormalizedImportRow[]): NormalizedImportRow[] {
  const byKey = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const indexes = byKey.get(row.dedupeKey) ?? [];
    indexes.push(index);
    byKey.set(row.dedupeKey, indexes);
  });

  const withDedupe = [...rows];
  for (const indexes of byKey.values()) {
    if (indexes.length <= 1) continue;

    indexes.forEach((rowIndex, position) => {
      const status = position === 0 ? 'possibleDuplicate' : 'duplicate';
      const duplicateIssue: ImportIssue = {
        code: 'possible_duplicate',
        severity: 'warning',
        message:
          status === 'duplicate'
            ? 'Riga duplicata rilevata rispetto a un altro movimento in anteprima.'
            : 'Possibile duplicato rilevato: verifica prima di importare.',
        rowIndex: withDedupe[rowIndex].rowIndex,
      };

      withDedupe[rowIndex] = {
        ...withDedupe[rowIndex],
        dedupeStatus: status,
        issues: [...withDedupe[rowIndex].issues, duplicateIssue],
      };
    });
  }

  return withDedupe;
}

export function buildCsvImportPreview(
  request: CsvImportPreviewRequest
): CsvImportPreviewResult {
  const parsed = parseCsvText(request.csvText, request.parser);
  const mappingValidation = validateColumnMapping(parsed.headers, request.mapping);
  const maxRows = Math.max(1, request.maxRows ?? DEFAULT_MAX_ROWS);
  const limitedRows = parsed.rows.slice(0, maxRows);

  const normalizedRows = limitedRows.map((sourceValues, index) => {
    const rowIndex = index + 1;

    try {
      const normalized = normalizeMappedRow({
        rowIndex,
        sourceHeaders: parsed.headers,
        sourceValues,
        mapping: request.mapping,
        locale: request.locale,
      });
      const classified = classifyImportRow(normalized);
      const dedupeKey = buildDedupeKeyForRow(classified);

      return {
        ...classified,
        dedupeKey,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        rowIndex,
        rawPreview: parsed.headers.reduce<Record<string, string>>((accumulator, header, headerIndex) => {
          accumulator[header] = sourceValues[headerIndex] ?? '';
          return accumulator;
        }, {}),
        canonicalFields: {
          date: null,
          description: null,
          amount: null,
          currency: request.locale.defaultCurrency.toUpperCase(),
          sourceType: null,
          sourceAccount: null,
          destinationAccount: null,
          assetTicker: null,
          assetIsin: null,
          assetName: null,
          quantity: null,
          unitPrice: null,
          fees: null,
          taxes: null,
        },
        movementKind: 'unknown',
        confidence: 'low',
        classificationReason: 'Classificazione non disponibile a causa di un errore di normalizzazione.',
        issues: [
          {
            code: 'row_processing_error',
            severity: 'blocking',
            message: `Errore durante la normalizzazione riga: ${message}`,
            rowIndex,
          },
        ],
        dedupeKey: `error|${rowIndex}`,
        dedupeStatus: 'unique',
      } satisfies NormalizedImportRow;
    }
  });

  const dedupedRows = dedupeRows(normalizedRows);
  const summaryByKind = emptyByKindSummary();
  let blockingRows = 0;
  let warningRows = 0;
  let readyRows = 0;

  dedupedRows.forEach((row) => {
    summaryByKind[row.movementKind] += 1;
    const hasBlocking = row.issues.some((issue) => issue.severity === 'blocking');
    const hasWarning = row.issues.some((issue) => issue.severity === 'warning');
    if (hasBlocking) {
      blockingRows += 1;
    } else {
      readyRows += 1;
    }
    if (hasWarning) {
      warningRows += 1;
    }
  });

  return {
    delimiter: parsed.delimiter,
    hasHeader: parsed.hasHeader,
    headers: parsed.headers,
    mappingValidation,
    rows: dedupedRows,
    summary: {
      totalRows: dedupedRows.length,
      readyRows,
      blockingRows,
      warningRows,
      byKind: summaryByKind,
    },
  };
}

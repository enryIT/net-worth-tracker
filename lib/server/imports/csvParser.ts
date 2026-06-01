import {
  CSV_DELIMITERS,
  type CsvDelimiter,
  type CsvParserOptions,
  type ParsedCsvText,
} from '@/lib/server/imports/types';

function sanitizeCell(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

function isLikelyDataCell(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^-?\d{1,3}([.,]\d{3})*([.,]\d+)?$/.test(trimmed)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return true;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(trimmed)) return true;
  return false;
}

function parseCsvLine(line: string, delimiter: CsvDelimiter): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(sanitizeCell(current));
      current = '';
      continue;
    }

    current += char;
  }

  values.push(sanitizeCell(current));
  return values;
}

function scoreDelimiter(lines: string[], delimiter: CsvDelimiter): number {
  const columnCounts = lines.map((line) => parseCsvLine(line, delimiter).length);
  const distinctCount = new Set(columnCounts).size;
  const averageColumns = columnCounts.reduce((sum, value) => sum + value, 0) / columnCounts.length;

  if (averageColumns <= 1) {
    return -Infinity;
  }

  return averageColumns * 10 - distinctCount * 2;
}

function detectDelimiter(lines: string[]): CsvDelimiter {
  let bestDelimiter: CsvDelimiter = ',';
  let bestScore = -Infinity;

  for (const candidate of CSV_DELIMITERS) {
    const score = scoreDelimiter(lines, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = candidate;
    }
  }

  return bestDelimiter;
}

function detectHeader(firstRow: string[], secondRow?: string[]): boolean {
  if (!firstRow.length) return false;
  if (!secondRow?.length) {
    return firstRow.some((cell) => /[A-Za-z]/.test(cell));
  }

  const firstHasText = firstRow.some((cell) => /[A-Za-z]/.test(cell));
  const firstMostlyData = firstRow.filter((cell) => isLikelyDataCell(cell)).length >= Math.ceil(firstRow.length / 2);
  const secondHasData = secondRow.some((cell) => isLikelyDataCell(cell));

  return firstHasText && !firstMostlyData && secondHasData;
}

function createSyntheticHeaders(columnCount: number): string[] {
  return Array.from({ length: Math.max(columnCount, 1) }, (_, index) => `column_${index + 1}`);
}

export function parseCsvText(csvText: string, options: CsvParserOptions = {}): ParsedCsvText {
  const normalizedText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalizedText
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      delimiter: options.delimiter ?? ',',
      hasHeader: options.hasHeader ?? false,
      headers: [],
      rows: [],
    };
  }

  const delimiter = options.delimiter ?? detectDelimiter(lines.slice(0, 12));
  const parsedRows = lines.map((line) => parseCsvLine(line, delimiter));
  const hasHeader = options.hasHeader ?? detectHeader(parsedRows[0], parsedRows[1]);

  const maxColumns = parsedRows.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = hasHeader
    ? parsedRows[0].map((cell, index) => cell || `column_${index + 1}`)
    : createSyntheticHeaders(maxColumns);

  const dataRows = hasHeader ? parsedRows.slice(1) : parsedRows;
  const normalizedRows = dataRows.map((row) => {
    if (row.length >= headers.length) {
      return row.slice(0, headers.length);
    }

    return [...row, ...Array.from({ length: headers.length - row.length }, () => '')];
  });

  return {
    delimiter,
    hasHeader,
    headers,
    rows: normalizedRows,
  };
}

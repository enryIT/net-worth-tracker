import type {
  CanonicalImportColumn,
  ImportColumnMapping,
  ImportIssue,
  LocaleNormalizationOptions,
  NormalizedCanonicalFields,
  NormalizedImportRow,
} from '@/lib/server/imports/types';

interface NormalizeMappedRowInput {
  rowIndex: number;
  sourceHeaders: string[];
  sourceValues: string[];
  mapping: ImportColumnMapping;
  locale: LocaleNormalizationOptions;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = (value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function parseDateByFormat(value: string, format: string): string | null {
  if (format === 'yyyy-MM-dd') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const [, yearRaw, monthRaw, dayRaw] = match;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    return `${yearRaw}-${monthRaw}-${dayRaw}`;
  }

  if (format === 'dd/MM/yyyy') {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;
    const [, dayRaw, monthRaw, yearRaw] = match;
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }

    const monthPadded = String(month).padStart(2, '0');
    const dayPadded = String(day).padStart(2, '0');
    return `${yearRaw}-${monthPadded}-${dayPadded}`;
  }

  return null;
}

function parseLocalizedNumber(
  rawValue: string | undefined,
  locale: LocaleNormalizationOptions
): number | null {
  const trimmed = (rawValue ?? '').trim();
  if (!trimmed) return null;

  const escapedThousands = locale.thousandsSeparator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withoutThousands = trimmed.replace(new RegExp(escapedThousands, 'g'), '');
  const normalizedDecimal =
    locale.decimalSeparator === ','
      ? withoutThousands.replace(',', '.')
      : withoutThousands;
  const sanitized = normalizedDecimal
    .replace(/\s/g, '')
    .replace(/[€$£]/g, '')
    .trim();

  if (!/^[+-]?\d+(\.\d+)?$/.test(sanitized)) {
    return null;
  }

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeIssue(
  rowIndex: number,
  issue: Omit<ImportIssue, 'rowIndex'>
): ImportIssue {
  return {
    ...issue,
    rowIndex,
  };
}

function findColumnValue(
  field: CanonicalImportColumn,
  headers: string[],
  values: string[],
  mapping: ImportColumnMapping
): string | undefined {
  const mappedColumn = mapping[field];
  if (!mappedColumn) return undefined;
  const columnIndex = headers.findIndex((header) => header.trim() === mappedColumn.trim());
  if (columnIndex < 0) return undefined;
  return values[columnIndex];
}

function buildRawPreview(headers: string[], values: string[]): Record<string, string> {
  return headers.reduce<Record<string, string>>((accumulator, header, index) => {
    accumulator[header] = values[index] ?? '';
    return accumulator;
  }, {});
}

export function normalizeMappedRow({
  rowIndex,
  sourceHeaders,
  sourceValues,
  mapping,
  locale,
}: NormalizeMappedRowInput): NormalizedImportRow {
  const issues: ImportIssue[] = [];
  const rawPreview = buildRawPreview(sourceHeaders, sourceValues);

  const dateRaw = findColumnValue('date', sourceHeaders, sourceValues, mapping);
  const descriptionRaw = findColumnValue('description', sourceHeaders, sourceValues, mapping);
  const amountRaw = findColumnValue('amount', sourceHeaders, sourceValues, mapping);
  const debitRaw = findColumnValue('debit', sourceHeaders, sourceValues, mapping);
  const creditRaw = findColumnValue('credit', sourceHeaders, sourceValues, mapping);
  const currencyRaw = findColumnValue('currency', sourceHeaders, sourceValues, mapping);

  let normalizedDate: string | null = null;
  const trimmedDate = (dateRaw ?? '').trim();
  if (!trimmedDate) {
    issues.push(
      makeIssue(rowIndex, {
        code: 'missing_required_field',
        severity: 'blocking',
        field: 'date',
        message: 'Data obbligatoria mancante.',
      })
    );
  } else {
    for (const format of locale.dateFormats) {
      const parsed = parseDateByFormat(trimmedDate, format);
      if (parsed) {
        normalizedDate = parsed;
        break;
      }
    }

    if (!normalizedDate) {
      issues.push(
        makeIssue(rowIndex, {
          code: 'invalid_date',
          severity: 'blocking',
          field: 'date',
          message: `Data non valida: "${trimmedDate}".`,
        })
      );
    }
  }

  const normalizedDescription = normalizeOptionalText(descriptionRaw);
  if (!normalizedDescription) {
    issues.push(
      makeIssue(rowIndex, {
        code: 'missing_required_field',
        severity: 'blocking',
        field: 'description',
        message: 'Descrizione obbligatoria mancante.',
      })
    );
  }

  let normalizedAmount: number | null = null;
  const amountParsed = parseLocalizedNumber(amountRaw, locale);
  const debitParsed = parseLocalizedNumber(debitRaw, locale);
  const creditParsed = parseLocalizedNumber(creditRaw, locale);

  if (mapping.amount) {
    const amountValuePresent = (amountRaw ?? '').trim().length > 0;
    if (amountValuePresent && amountParsed === null) {
      issues.push(
        makeIssue(rowIndex, {
          code: 'invalid_amount',
          severity: 'blocking',
          field: 'amount',
          message: `Importo non valido: "${amountRaw}".`,
        })
      );
    } else if (amountValuePresent) {
      normalizedAmount = amountParsed;
    } else {
      issues.push(
        makeIssue(rowIndex, {
          code: 'missing_required_field',
          severity: 'blocking',
          field: 'amount',
          message: 'Importo obbligatorio mancante.',
        })
      );
    }
  } else if (mapping.debit || mapping.credit) {
    const debitPresent = (debitRaw ?? '').trim().length > 0;
    const creditPresent = (creditRaw ?? '').trim().length > 0;

    if (debitPresent && debitParsed === null) {
      issues.push(
        makeIssue(rowIndex, {
          code: 'invalid_amount',
          severity: 'blocking',
          field: 'debit',
          message: `Addebito non valido: "${debitRaw}".`,
        })
      );
    }

    if (creditPresent && creditParsed === null) {
      issues.push(
        makeIssue(rowIndex, {
          code: 'invalid_amount',
          severity: 'blocking',
          field: 'credit',
          message: `Accredito non valido: "${creditRaw}".`,
        })
      );
    }

    if (!debitPresent && !creditPresent) {
      issues.push(
        makeIssue(rowIndex, {
          code: 'missing_required_field',
          severity: 'blocking',
          field: 'amount',
          message: 'Importo obbligatorio mancante (Addebito/Accredito vuoti).',
        })
      );
    } else if (debitParsed !== null || creditParsed !== null) {
      const debitAmount = Math.abs(debitParsed ?? 0);
      const creditAmount = Math.abs(creditParsed ?? 0);

      if (debitAmount > 0 && creditAmount > 0) {
        issues.push(
          makeIssue(rowIndex, {
            code: 'ambiguous_debit_credit',
            severity: 'warning',
            field: 'amount',
            message: 'Sia Addebito che Accredito valorizzati: calcolo importo come Accredito - Addebito.',
          })
        );
      }

      normalizedAmount = creditAmount - debitAmount;
    }
  }

  if (normalizedAmount === null && !issues.some((issue) => issue.field === 'amount' && issue.severity === 'blocking')) {
    issues.push(
      makeIssue(rowIndex, {
        code: 'missing_required_field',
        severity: 'blocking',
        field: 'amount',
        message: 'Importo obbligatorio mancante.',
      })
    );
  }

  const optionalNumberField = (field: CanonicalImportColumn): number | null => {
    const rawValue = findColumnValue(field, sourceHeaders, sourceValues, mapping);
    if (!rawValue || rawValue.trim().length === 0) return null;
    const parsed = parseLocalizedNumber(rawValue, locale);
    if (parsed !== null) return parsed;

    issues.push(
      makeIssue(rowIndex, {
        code: 'invalid_number',
        severity: 'blocking',
        field,
        message: `Valore numerico non valido per ${field}: "${rawValue}".`,
      })
    );
    return null;
  };

  const canonicalFields: NormalizedCanonicalFields = {
    date: normalizedDate,
    description: normalizedDescription,
    amount: normalizedAmount,
    currency: normalizeOptionalText(currencyRaw)?.toUpperCase() ?? locale.defaultCurrency.toUpperCase(),
    sourceType: normalizeOptionalText(findColumnValue('sourceType', sourceHeaders, sourceValues, mapping)),
    sourceAccount: normalizeOptionalText(findColumnValue('sourceAccount', sourceHeaders, sourceValues, mapping)),
    destinationAccount: normalizeOptionalText(findColumnValue('destinationAccount', sourceHeaders, sourceValues, mapping)),
    assetTicker: normalizeOptionalText(findColumnValue('assetTicker', sourceHeaders, sourceValues, mapping))?.toUpperCase() ?? null,
    assetIsin: normalizeOptionalText(findColumnValue('assetIsin', sourceHeaders, sourceValues, mapping))?.toUpperCase() ?? null,
    assetName: normalizeOptionalText(findColumnValue('assetName', sourceHeaders, sourceValues, mapping)),
    quantity: optionalNumberField('quantity'),
    unitPrice: optionalNumberField('unitPrice'),
    fees: optionalNumberField('fees'),
    taxes: optionalNumberField('taxes'),
  };

  return {
    rowIndex,
    rawPreview,
    canonicalFields,
    movementKind: 'unknown',
    confidence: 'low',
    classificationReason: 'Classificazione non ancora eseguita.',
    issues,
    dedupeKey: '',
    dedupeStatus: 'unique',
  };
}

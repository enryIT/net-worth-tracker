import type { NormalizedImportRow } from '@/lib/server/imports/types';

function normalizeText(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '';
  }
  return value.toFixed(6);
}

export function buildDedupeKeyForRow(row: NormalizedImportRow): string {
  const fields = row.canonicalFields;
  const base = [
    row.movementKind,
    fields.date ?? '',
    normalizeNumber(fields.amount),
    normalizeText(fields.currency),
    normalizeText(fields.description),
  ];

  if (row.movementKind === 'transfer') {
    base.push(
      normalizeText(fields.sourceAccount),
      normalizeText(fields.destinationAccount)
    );
  } else if (row.movementKind === 'investmentOperation') {
    base.push(
      normalizeText(fields.assetIsin),
      normalizeText(fields.assetTicker),
      normalizeNumber(fields.quantity),
      normalizeNumber(fields.unitPrice),
      normalizeNumber(fields.fees),
      normalizeNumber(fields.taxes)
    );
  } else if (row.movementKind === 'dividend') {
    base.push(
      normalizeText(fields.assetIsin),
      normalizeText(fields.assetTicker)
    );
  } else if (row.movementKind === 'fee' || row.movementKind === 'tax') {
    base.push(normalizeText(fields.sourceType));
  }

  return base.join('|');
}

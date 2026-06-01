import type {
  ClassificationConfidence,
  ImportMovementKind,
  NormalizedImportRow,
} from '@/lib/server/imports/types';

const DIVIDEND_KEYWORDS = ['cedola', 'dividendo', 'dividend', 'coupon', 'cedole'];
const FEE_KEYWORDS = ['commissione', 'commissioni', 'fee', 'canone', 'spesa bancaria'];
const TAX_KEYWORDS = ['tassa', 'imposta', 'tax', 'withholding', 'bollo'];
const TRANSFER_KEYWORDS = ['bonifico interno', 'giroconto', 'trasferimento', 'transfer'];
const INVESTMENT_KEYWORDS = ['acquisto', 'vendita', 'buy', 'sell', 'trade'];

function normalizeForSearch(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAnyKeyword(value: string, keywords: string[]): string | null {
  for (const keyword of keywords) {
    if (value.includes(keyword)) return keyword;
  }
  return null;
}

function buildResult(
  row: NormalizedImportRow,
  movementKind: ImportMovementKind,
  confidence: ClassificationConfidence,
  reason: string
): NormalizedImportRow {
  return {
    ...row,
    movementKind,
    confidence,
    classificationReason: reason,
  };
}

export function classifyImportRow(row: NormalizedImportRow): NormalizedImportRow {
  const sourceType = normalizeForSearch(row.canonicalFields.sourceType);
  const description = normalizeForSearch(row.canonicalFields.description);
  const combined = `${sourceType} ${description}`.trim();

  const dividendKeyword = containsAnyKeyword(combined, DIVIDEND_KEYWORDS);
  if (dividendKeyword) {
    return buildResult(
      row,
      'dividend',
      'high',
      `Classificato come dividendo: rilevata parola chiave "${dividendKeyword}".`
    );
  }

  const feeKeyword = containsAnyKeyword(combined, FEE_KEYWORDS);
  if (feeKeyword) {
    return buildResult(
      row,
      'fee',
      'high',
      `Classificato come commissione: rilevata parola chiave "${feeKeyword}".`
    );
  }

  const taxKeyword = containsAnyKeyword(combined, TAX_KEYWORDS);
  if (taxKeyword) {
    return buildResult(
      row,
      'tax',
      'high',
      `Classificato come tassa: rilevata parola chiave "${taxKeyword}".`
    );
  }

  const transferKeyword = containsAnyKeyword(combined, TRANSFER_KEYWORDS);
  if (transferKeyword || (row.canonicalFields.sourceAccount && row.canonicalFields.destinationAccount)) {
    return buildResult(
      row,
      'transfer',
      'high',
      transferKeyword
        ? `Classificato come trasferimento: rilevata parola chiave "${transferKeyword}".`
        : 'Classificato come trasferimento: presenti conto sorgente e conto destinazione.'
    );
  }

  const hasTradingNumbers =
    row.canonicalFields.quantity !== null &&
    row.canonicalFields.unitPrice !== null;
  const hasAssetReference =
    row.canonicalFields.assetTicker !== null ||
    row.canonicalFields.assetIsin !== null ||
    row.canonicalFields.assetName !== null;
  const investmentKeyword = containsAnyKeyword(combined, INVESTMENT_KEYWORDS);

  if (hasTradingNumbers || (hasAssetReference && investmentKeyword)) {
    return buildResult(
      row,
      'investmentOperation',
      hasTradingNumbers ? 'high' : 'medium',
      hasTradingNumbers
        ? 'Classificato come operazione di investimento: quantità e prezzo unitario presenti.'
        : `Classificato come operazione di investimento: riferimento asset + parola chiave "${investmentKeyword}".`
    );
  }

  if (row.canonicalFields.amount !== null) {
    return buildResult(
      row,
      'cashflow',
      'medium',
      'Classificato come cashflow per fallback: importo valido senza segnali più specifici.'
    );
  }

  return buildResult(
    row,
    'unknown',
    'low',
    'Classificazione non determinabile con i campi disponibili.'
  );
}

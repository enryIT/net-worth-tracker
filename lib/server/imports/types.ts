export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;

export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export type CanonicalImportColumn =
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'currency'
  | 'sourceType'
  | 'sourceAccount'
  | 'destinationAccount'
  | 'assetTicker'
  | 'assetIsin'
  | 'assetName'
  | 'quantity'
  | 'unitPrice'
  | 'fees'
  | 'taxes'
  | 'paymentDate'
  | 'exDate'
  | 'grossAmount'
  | 'taxAmount'
  | 'netAmount'
  | 'dividendType'
  | 'linkedMovementReference';

export type ImportMovementKind =
  | 'cashflow'
  | 'transfer'
  | 'investmentOperation'
  | 'dividend'
  | 'fee'
  | 'tax'
  | 'unknown';

export type ClassificationConfidence = 'high' | 'medium' | 'low';

export type ImportIssueSeverity = 'blocking' | 'warning';

export type ImportDedupeStatus = 'unique' | 'possibleDuplicate' | 'duplicate';

export type ImportIssueCode =
  | 'missing_required_mapping'
  | 'unknown_mapped_column'
  | 'conflicting_amount_mapping'
  | 'incomplete_debit_credit_mapping'
  | 'duplicated_source_column_mapping'
  | 'missing_required_field'
  | 'invalid_date'
  | 'invalid_amount'
  | 'invalid_number'
  | 'ambiguous_debit_credit'
  | 'amount_mismatch'
  | 'possible_duplicate'
  | 'row_processing_error'
  | 'classification_low_confidence';

export interface ImportIssue {
  code: ImportIssueCode;
  severity: ImportIssueSeverity;
  message: string;
  field?: CanonicalImportColumn | string;
  rowIndex?: number;
}

export type ImportColumnMapping = Partial<Record<CanonicalImportColumn, string>>;

export interface LocaleNormalizationOptions {
  dateFormats: string[];
  decimalSeparator: ',' | '.';
  thousandsSeparator: ',' | '.' | ' ' | "'";
  defaultCurrency: string;
}

export interface ParsedCsvText {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  headers: string[];
  rows: string[][];
}

export interface MappingValidationResult {
  blocking: ImportIssue[];
  warnings: ImportIssue[];
}

export interface NormalizedCanonicalFields {
  date: string | null;
  description: string | null;
  amount: number | null;
  currency: string | null;
  sourceType: string | null;
  sourceAccount: string | null;
  destinationAccount: string | null;
  assetTicker: string | null;
  assetIsin: string | null;
  assetName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  fees: number | null;
  taxes: number | null;
  paymentDate?: string | null;
  exDate?: string | null;
  grossAmount?: number | null;
  taxAmount?: number | null;
  netAmount?: number | null;
  dividendType?: string | null;
  linkedMovementReference?: string | null;
}

export interface NormalizedImportRow {
  rowIndex: number;
  rawPreview: Record<string, string>;
  canonicalFields: NormalizedCanonicalFields;
  movementKind: ImportMovementKind;
  confidence: ClassificationConfidence;
  classificationReason: string;
  issues: ImportIssue[];
  dedupeKey: string;
  dedupeStatus: ImportDedupeStatus;
}

export interface CsvParserOptions {
  delimiter?: CsvDelimiter;
  hasHeader?: boolean;
}

export interface CsvImportPreviewRequest {
  csvText: string;
  mapping: ImportColumnMapping;
  locale: LocaleNormalizationOptions;
  parser?: CsvParserOptions;
  maxRows?: number;
}

export interface CsvImportPreviewSummary {
  totalRows: number;
  readyRows: number;
  blockingRows: number;
  warningRows: number;
  byKind: Record<ImportMovementKind, number>;
}

export interface CsvImportPreviewResult {
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  headers: string[];
  mappingValidation: MappingValidationResult;
  rows: NormalizedImportRow[];
  summary: CsvImportPreviewSummary;
}

import type {
  ImportColumnMapping,
  ImportMovementKind,
  LocaleNormalizationOptions,
} from '@/lib/server/imports/types';

export const CSV_IMPORT_RULE_FIELDS = [
  'description',
  'sourceType',
  'sourceAccount',
  'destinationAccount',
  'assetTicker',
  'assetIsin',
  'assetName',
  'currency',
] as const;

export type CsvImportRuleField = (typeof CSV_IMPORT_RULE_FIELDS)[number];

export const CSV_IMPORT_RULE_OPERATORS = [
  'contains',
  'equals',
  'startsWith',
  'endsWith',
  'regex',
] as const;

export type CsvImportRuleOperator = (typeof CSV_IMPORT_RULE_OPERATORS)[number];

export interface CsvImportClassificationRule {
  field: CsvImportRuleField;
  operator: CsvImportRuleOperator;
  value: string;
  movementKind: ImportMovementKind;
  caseSensitive?: boolean;
}

export interface CsvImportPreset {
  id: string;
  userId: string;
  name: string;
  sourceLabel: string | null;
  mapping: ImportColumnMapping;
  locale: LocaleNormalizationOptions;
  classificationRules?: CsvImportClassificationRule[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface CsvImportPresetCreateInput {
  name: string;
  sourceLabel?: string | null;
  mapping: ImportColumnMapping;
  locale: LocaleNormalizationOptions;
  classificationRules?: CsvImportClassificationRule[];
}

export interface CsvImportPresetUpdateInput {
  name?: string;
  sourceLabel?: string | null;
  mapping?: ImportColumnMapping;
  locale?: LocaleNormalizationOptions;
  classificationRules?: CsvImportClassificationRule[];
}

export type CsvImportPresetUpdatePatch = Partial<
  Pick<
    CsvImportPreset,
    | 'name'
    | 'sourceLabel'
    | 'mapping'
    | 'locale'
    | 'classificationRules'
    | 'updatedAt'
    | 'lastUsedAt'
  >
>;

export interface CsvImportPresetRepository {
  create(preset: CsvImportPreset): Promise<void>;
  listByUserId(userId: string): Promise<CsvImportPreset[]>;
  getById(presetId: string): Promise<CsvImportPreset | null>;
  update(presetId: string, patch: CsvImportPresetUpdatePatch): Promise<CsvImportPreset | null>;
  delete(presetId: string): Promise<void>;
}

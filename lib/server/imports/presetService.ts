import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createFirestoreCsvImportPresetRepository } from '@/lib/server/imports/presetRepository';
import {
  CSV_IMPORT_RULE_FIELDS,
  CSV_IMPORT_RULE_OPERATORS,
  type CsvImportPreset,
  type CsvImportPresetCreateInput,
  type CsvImportPresetRepository,
  type CsvImportPresetUpdateInput,
  type CsvImportPresetUpdatePatch,
} from '@/lib/server/imports/presetTypes';

const mappedColumnNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\r\n]/.test(value), {
    message: 'I nomi colonna non possono contenere righe CSV',
  });

const importColumnMappingSchema = z
  .object({
    date: mappedColumnNameSchema.optional(),
    description: mappedColumnNameSchema.optional(),
    amount: mappedColumnNameSchema.optional(),
    debit: mappedColumnNameSchema.optional(),
    credit: mappedColumnNameSchema.optional(),
    currency: mappedColumnNameSchema.optional(),
    sourceType: mappedColumnNameSchema.optional(),
    sourceAccount: mappedColumnNameSchema.optional(),
    destinationAccount: mappedColumnNameSchema.optional(),
    assetTicker: mappedColumnNameSchema.optional(),
    assetIsin: mappedColumnNameSchema.optional(),
    assetName: mappedColumnNameSchema.optional(),
    quantity: mappedColumnNameSchema.optional(),
    unitPrice: mappedColumnNameSchema.optional(),
    fees: mappedColumnNameSchema.optional(),
    taxes: mappedColumnNameSchema.optional(),
  })
  .strict()
  .superRefine((mapping, context) => {
    const mappedColumns = Object.values(mapping).filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0
    );

    if (mappedColumns.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mappatura vuota',
      });
      return;
    }

    if (!mapping.date || !mapping.description) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le colonne data e descrizione sono obbligatorie',
      });
    }

    const hasAmount = Boolean(mapping.amount);
    const hasDebit = Boolean(mapping.debit);
    const hasCredit = Boolean(mapping.credit);

    if (!hasAmount && !(hasDebit && hasCredit)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'È richiesto Importo oppure Addebito e Accredito',
      });
    }
  });

const localeSchema = z
  .object({
    dateFormats: z.array(z.string().trim().min(1)).min(1),
    decimalSeparator: z.union([z.literal(','), z.literal('.')]),
    thousandsSeparator: z.union([
      z.literal(','),
      z.literal('.'),
      z.literal(' '),
      z.literal("'"),
    ]),
    defaultCurrency: z.string().trim().min(1).max(8),
  })
  .strict();

const classificationRuleSchema = z
  .object({
    field: z.enum(CSV_IMPORT_RULE_FIELDS),
    operator: z.enum(CSV_IMPORT_RULE_OPERATORS),
    value: z.string().trim().min(1).max(300).refine((value) => !/[\r\n]/.test(value), {
      message: 'Le regole non possono contenere righe CSV',
    }),
    movementKind: z.enum([
      'cashflow',
      'transfer',
      'investmentOperation',
      'dividend',
      'fee',
      'tax',
      'unknown',
    ]),
    caseSensitive: z.boolean().optional(),
  })
  .strict();

const createInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    sourceLabel: z.string().trim().min(1).max(160).nullable().optional(),
    mapping: importColumnMappingSchema,
    locale: localeSchema,
    classificationRules: z.array(classificationRuleSchema).max(100).optional(),
  })
  .strict();

const updateInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    sourceLabel: z.string().trim().min(1).max(160).nullable().optional(),
    mapping: importColumnMappingSchema.optional(),
    locale: localeSchema.optional(),
    classificationRules: z.array(classificationRuleSchema).max(100).optional(),
    lastUsedAt: z.string().datetime().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nessun campo da aggiornare',
      });
    }
  });

export class CsvImportPresetServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CsvImportPresetServiceError';
    this.status = status;
  }
}

interface CsvImportPresetServiceDependencies {
  repository: CsvImportPresetRepository;
  now: () => Date;
  generateId: () => string;
}

function ensureAuthenticatedUserId(userId: string): void {
  if (!userId || userId.trim().length === 0) {
    throw new CsvImportPresetServiceError(400, 'User ID is required');
  }
}

function parseCreateInput(input: CsvImportPresetCreateInput): CsvImportPresetCreateInput {
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CsvImportPresetServiceError(400, 'Payload non valido');
  }

  return parsed.data;
}

function parseUpdateInput(input: CsvImportPresetUpdateInput): CsvImportPresetUpdateInput {
  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new CsvImportPresetServiceError(400, 'Payload non valido');
  }

  return parsed.data;
}

function ensureOwner(preset: CsvImportPreset, userId: string): void {
  if (preset.userId !== userId) {
    throw new CsvImportPresetServiceError(403, 'Resource does not belong to authenticated user');
  }
}

export function isCsvImportPresetServiceError(error: unknown): error is CsvImportPresetServiceError {
  return error instanceof CsvImportPresetServiceError;
}

export function createCsvImportPresetService(
  dependencies: Partial<CsvImportPresetServiceDependencies> = {}
) {
  const repository = dependencies.repository ?? createFirestoreCsvImportPresetRepository();
  const now = dependencies.now ?? (() => new Date());
  const generateId = dependencies.generateId ?? (() => randomUUID());

  return {
    async createPreset(userId: string, input: CsvImportPresetCreateInput): Promise<CsvImportPreset> {
      ensureAuthenticatedUserId(userId);
      const parsedInput = parseCreateInput(input);
      const timestamp = now().toISOString();

      const preset: CsvImportPreset = {
        id: generateId(),
        userId,
        name: parsedInput.name,
        sourceLabel: parsedInput.sourceLabel ?? null,
        mapping: parsedInput.mapping,
        locale: parsedInput.locale,
        classificationRules: parsedInput.classificationRules ?? [],
        createdAt: timestamp,
        updatedAt: timestamp,
        lastUsedAt: null,
      };

      await repository.create(preset);
      return preset;
    },

    async listPresets(userId: string): Promise<CsvImportPreset[]> {
      ensureAuthenticatedUserId(userId);
      const presets = await repository.listByUserId(userId);

      return presets.sort((left, right) => {
        if (left.updatedAt === right.updatedAt) {
          return right.createdAt.localeCompare(left.createdAt);
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      });
    },

    async updatePreset(
      userId: string,
      presetId: string,
      input: CsvImportPresetUpdateInput
    ): Promise<CsvImportPreset> {
      ensureAuthenticatedUserId(userId);

      if (!presetId || presetId.trim().length === 0) {
        throw new CsvImportPresetServiceError(400, 'Preset ID is required');
      }

      const parsedInput = parseUpdateInput(input);
      const existingPreset = await repository.getById(presetId);

      if (!existingPreset) {
        throw new CsvImportPresetServiceError(404, 'Preset non trovato');
      }

      ensureOwner(existingPreset, userId);

      const patch: CsvImportPresetUpdatePatch = {
        ...parsedInput,
        updatedAt: now().toISOString(),
      };

      const updatedPreset = await repository.update(presetId, patch);

      if (!updatedPreset) {
        throw new CsvImportPresetServiceError(404, 'Preset non trovato');
      }

      return updatedPreset;
    },

    async deletePreset(userId: string, presetId: string): Promise<void> {
      ensureAuthenticatedUserId(userId);

      if (!presetId || presetId.trim().length === 0) {
        throw new CsvImportPresetServiceError(400, 'Preset ID is required');
      }

      const existingPreset = await repository.getById(presetId);

      if (!existingPreset) {
        throw new CsvImportPresetServiceError(404, 'Preset non trovato');
      }

      ensureOwner(existingPreset, userId);
      await repository.delete(presetId);
    },
  };
}

const defaultCsvImportPresetService = createCsvImportPresetService();

export async function listCsvImportPresets(userId: string): Promise<CsvImportPreset[]> {
  return defaultCsvImportPresetService.listPresets(userId);
}

export async function createCsvImportPreset(
  userId: string,
  input: CsvImportPresetCreateInput
): Promise<CsvImportPreset> {
  return defaultCsvImportPresetService.createPreset(userId, input);
}

export async function updateCsvImportPreset(
  userId: string,
  presetId: string,
  input: CsvImportPresetUpdateInput
): Promise<CsvImportPreset> {
  return defaultCsvImportPresetService.updatePreset(userId, presetId, input);
}

export async function deleteCsvImportPreset(userId: string, presetId: string): Promise<void> {
  return defaultCsvImportPresetService.deletePreset(userId, presetId);
}

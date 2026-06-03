import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { createFirestoreCsvImportCashflowBatchRepository, createFirestoreCsvImportCashflowCategoryRepository } from '@/lib/server/imports/cashflowCommitRepository';
import { invalidateDashboardOverviewSummaryServer as defaultInvalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { ITALY_TIMEZONE, formatDateInputValue, toDate } from '@/lib/utils/dateHelpers';
import type {
  CsvImportCashflowBatch,
  CsvImportCashflowBatchRepository,
  CsvImportCashflowCategoryRepository,
  CsvImportCashflowCommitInput,
  CsvImportCashflowCommitResult,
  CsvImportCashflowCommitRowInput,
  CsvImportCashflowCreatedRecord,
  CsvImportCashflowExpenseRecord,
  CsvImportCashflowInternalTransferRecord,
  CsvImportCashflowRollbackResult,
  CsvImportCashflowCategoryRecord,
  CsvImportCashflowAssetRecord,
} from '@/lib/server/imports/cashflowCommitTypes';

interface CsvImportCashflowCommitServiceDependencies {
  repository: CsvImportCashflowBatchRepository;
  categoryRepository: CsvImportCashflowCategoryRepository;
  now: () => Date;
  generateId: () => string;
  invalidateDashboardOverviewSummaryServer: (userId: string, reason: string) => Promise<void>;
}

export class CsvImportCashflowCommitServiceError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'CsvImportCashflowCommitServiceError';
    this.status = status;
    this.details = details;
  }
}

export function isCsvImportCashflowCommitServiceError(error: unknown): error is CsvImportCashflowCommitServiceError {
  return error instanceof CsvImportCashflowCommitServiceError;
}

function ensureAuthenticatedUserId(userId: string): void {
  if (!userId || userId.trim().length === 0) {
    throw new CsvImportCashflowCommitServiceError(400, 'User ID is required');
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDuplicateText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeDuplicateAmount(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : '';
}

function buildConservativeExpenseDuplicateKey(
  date: Date,
  amount: number,
  currency: string,
  notes: string
): string {
  return [
    formatDateInputValue(date),
    normalizeDuplicateAmount(amount),
    normalizeDuplicateText(currency),
    normalizeDuplicateText(notes),
  ].join('|');
}

function buildItalyDayBoundary(dateKey: string, endOfDay: boolean): Date {
  return fromZonedTime(
    `${dateKey}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`,
    ITALY_TIMEZONE
  );
}

function getDateRangeForRows(rows: Array<{ parsedDate: Date }>): { startDate: Date; endDate: Date } {
  const dateKeys = rows.map(({ parsedDate }) => formatDateInputValue(parsedDate));
  const startDateKey = dateKeys.reduce((currentMin, next) => (next < currentMin ? next : currentMin));
  const endDateKey = dateKeys.reduce((currentMax, next) => (next > currentMax ? next : currentMax));

  return {
    startDate: buildItalyDayBoundary(startDateKey, false),
    endDate: buildItalyDayBoundary(endDateKey, true),
  };
}

interface PreparedCommitRow {
  row: CsvImportCashflowCommitRowInput;
  parsedDate: Date;
}

interface PreparedCashflowCommitRow extends PreparedCommitRow {
  row: CsvImportCashflowCommitRowInput & { movementKind: 'cashflow' };
}

function buildRequestFingerprint(
  userId: string,
  input: CsvImportCashflowCommitInput
): string {
  const payload = {
    userId,
    idempotencyKey: input.idempotencyKey,
    presetId: input.presetId ?? null,
    sourceFingerprint: input.sourceFingerprint ?? null,
    rows: input.rows.map((row) => ({
      rowIndex: row.rowIndex,
      movementKind: row.movementKind,
      ready: row.ready,
      dedupeKey: row.dedupeKey,
      dedupeStatus: row.dedupeStatus,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      subCategoryId: row.subCategoryId ?? null,
      subCategoryName: row.subCategoryName ?? null,
      amount: row.canonicalFields.amount,
      currency: row.canonicalFields.currency,
      date: row.canonicalFields.date,
    })),
  };

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function getUnsupportedCashflowFields(row: CsvImportCashflowCommitRowInput): string[] {
  const unsupportedFields: string[] = [];
  const fields = row.canonicalFields;

  if (fields.sourceAccount) unsupportedFields.push('sourceAccount');
  if (fields.destinationAccount) unsupportedFields.push('destinationAccount');
  if (fields.assetTicker) unsupportedFields.push('assetTicker');
  if (fields.assetIsin) unsupportedFields.push('assetIsin');
  if (fields.assetName) unsupportedFields.push('assetName');
  if (fields.quantity !== null) unsupportedFields.push('quantity');
  if (fields.unitPrice !== null) unsupportedFields.push('unitPrice');
  if (fields.fees !== null) unsupportedFields.push('fees');
  if (fields.taxes !== null) unsupportedFields.push('taxes');

  return unsupportedFields;
}

function assertRowCommonCommitReady(row: CsvImportCashflowCommitRowInput): void {
  if (!row.ready) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga non è marcata come pronta',
      { rowIndex: row.rowIndex }
    );
  }

  if (row.issues.some((issue) => issue.severity === 'blocking')) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga contiene errori bloccanti',
      { rowIndex: row.rowIndex, issues: row.issues }
    );
  }

  if (row.dedupeStatus === 'duplicate') {
    throw new CsvImportCashflowCommitServiceError(
      409,
      'Riga duplicata rilevata nell\'archivio import',
      { rowIndex: row.rowIndex, dedupeKey: row.dedupeKey }
    );
  }
}

function assertCashflowRowIsCommitReady(row: CsvImportCashflowCommitRowInput): asserts row is CsvImportCashflowCommitRowInput & { movementKind: 'cashflow' } {
  assertRowCommonCommitReady(row);

  if (row.movementKind !== 'cashflow') {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La commit import CSV accetta solo righe cashflow o transfer pronte',
      { rowIndex: row.rowIndex, movementKind: row.movementKind }
    );
  }

  if (!row.categoryId?.trim() || !row.categoryName?.trim()) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Categoria confermata obbligatoria per la commit cashflow',
      { rowIndex: row.rowIndex }
    );
  }

  const dateValue = row.canonicalFields.date;
  const amountValue = row.canonicalFields.amount;
  const descriptionValue = row.canonicalFields.description;

  if (!dateValue || !descriptionValue || amountValue === null) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga cashflow richiede data, descrizione e importo validi',
      { rowIndex: row.rowIndex }
    );
  }

  const unsupportedFields = getUnsupportedCashflowFields(row);
  if (unsupportedFields.length > 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La commit cashflow accetta solo movimenti ordinari senza riferimenti transfer o investimento',
      { rowIndex: row.rowIndex, unsupportedFields }
    );
  }

  if (!Number.isFinite(amountValue) || amountValue === 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Importo cashflow non valido',
      { rowIndex: row.rowIndex, amount: amountValue }
    );
  }
}

function assertTransferRowIsCommitReady(row: CsvImportCashflowCommitRowInput): asserts row is CsvImportCashflowCommitRowInput & { movementKind: 'transfer' } {
  assertRowCommonCommitReady(row);

  if (row.movementKind !== 'transfer') {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La commit import CSV accetta solo righe cashflow o transfer pronte',
      { rowIndex: row.rowIndex, movementKind: row.movementKind }
    );
  }

  const { date, description, amount, sourceAccount, destinationAccount, fees, taxes } = row.canonicalFields;
  if (!date || !description || amount === null) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga transfer richiede data, descrizione e importo validi',
      { rowIndex: row.rowIndex }
    );
  }

  if (!Number.isFinite(amount) || amount === 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Importo transfer non valido',
      { rowIndex: row.rowIndex, amount }
    );
  }

  if (!sourceAccount?.trim() || !destinationAccount?.trim()) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il transfer richiede conto origine e conto destinazione confermati',
      { rowIndex: row.rowIndex }
    );
  }

  if (sourceAccount === destinationAccount) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il conto origine e il conto destinazione del transfer devono essere diversi',
      { rowIndex: row.rowIndex, sourceAccount, destinationAccount }
    );
  }

  if (fees !== null && (!Number.isFinite(fees) || fees < 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Commissioni transfer non valide',
      { rowIndex: row.rowIndex, fees }
    );
  }

  if (taxes !== null && taxes !== 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Le imposte non sono supportate sui transfer interni CSV',
      { rowIndex: row.rowIndex, taxes }
    );
  }
}

function assertSupportedRowIsCommitReady(row: CsvImportCashflowCommitRowInput): void {
  if (row.movementKind === 'cashflow') {
    assertCashflowRowIsCommitReady(row);
    return;
  }

  if (row.movementKind === 'transfer') {
    assertTransferRowIsCommitReady(row);
    return;
  }

  throw new CsvImportCashflowCommitServiceError(
    400,
    'La commit import CSV accetta solo righe cashflow o transfer pronte',
    { rowIndex: row.rowIndex, movementKind: row.movementKind }
  );
}

function ensureNoCategoryGuessing(
  row: CsvImportCashflowCommitRowInput,
  category: CsvImportCashflowCategoryRecord
): void {
  if (normalizeText(category.name) !== normalizeText(row.categoryName)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Nome categoria confermata non coerente con la categoria esistente',
      { rowIndex: row.rowIndex, categoryId: row.categoryId }
    );
  }
}

function resolveSubCategory(
  row: CsvImportCashflowCommitRowInput,
  category: CsvImportCashflowCategoryRecord
): { id: string | null; name: string | null } {
  const hasSubCategory = Boolean(row.subCategoryId?.trim() || row.subCategoryName?.trim());
  if (!hasSubCategory) {
    return { id: null, name: null };
  }

  if (!row.subCategoryId?.trim() || !row.subCategoryName?.trim()) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Sottocategoria confermata incompleta',
      { rowIndex: row.rowIndex, categoryId: row.categoryId }
    );
  }

  const matchedSubCategory = category.subCategories.find((subCategory) => subCategory.id === row.subCategoryId);
  if (!matchedSubCategory) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Sottocategoria confermata non coerente con la categoria selezionata',
      { rowIndex: row.rowIndex, categoryId: row.categoryId, subCategoryId: row.subCategoryId }
    );
  }

  if (normalizeText(matchedSubCategory.name) !== normalizeText(row.subCategoryName)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Nome sottocategoria confermato non coerente con la sottocategoria esistente',
      { rowIndex: row.rowIndex, categoryId: row.categoryId, subCategoryId: row.subCategoryId }
    );
  }

  return {
    id: matchedSubCategory.id,
    name: matchedSubCategory.name,
  };
}

function assertAmountMatchesCategoryType(
  row: CsvImportCashflowCommitRowInput,
  category: CsvImportCashflowCategoryRecord
): void {
  const amount = row.canonicalFields.amount ?? 0;
  const isIncomeCategory = category.type === 'income';
  const isPositive = amount > 0;

  if (isIncomeCategory && !isPositive) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Le entrate importate devono avere importo positivo',
      { rowIndex: row.rowIndex, categoryId: row.categoryId, amount }
    );
  }

  if (!isIncomeCategory && isPositive) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Le uscite importate devono avere importo negativo',
      { rowIndex: row.rowIndex, categoryId: row.categoryId, amount }
    );
  }
}

function buildCreatedExpenseRecord(
  userId: string,
  batchId: string,
  input: CsvImportCashflowCommitInput,
  row: CsvImportCashflowCommitRowInput,
  category: CsvImportCashflowCategoryRecord,
  generatedExpenseId: string,
  now: Date,
  subCategory: { id: string | null; name: string | null }
): CsvImportCashflowExpenseRecord {
  const amount = row.canonicalFields.amount ?? 0;
  const parsedDate = toDate(row.canonicalFields.date);

  return {
    id: generatedExpenseId,
    userId,
    batchId,
    rowIndex: row.rowIndex,
    dedupeKey: row.dedupeKey,
    type: category.type,
    categoryId: category.id,
    categoryName: category.name,
    subCategoryId: subCategory.id,
    subCategoryName: subCategory.name,
    amount,
    currency: (row.canonicalFields.currency ?? 'EUR').toUpperCase(),
    date: parsedDate,
    notes: row.canonicalFields.description ?? '',
    importBatchId: batchId,
    importIdempotencyKey: input.idempotencyKey,
    importSourceFingerprint: input.sourceFingerprint ?? null,
    importPresetId: input.presetId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildCreatedRecordSummary(expense: CsvImportCashflowExpenseRecord): CsvImportCashflowCreatedRecord {
  return {
    kind: 'cashflow',
    id: expense.id,
    rowIndex: expense.rowIndex,
    dedupeKey: expense.dedupeKey,
    amount: expense.amount,
    currency: expense.currency,
    type: expense.type,
    categoryId: expense.categoryId,
    categoryName: expense.categoryName,
    subCategoryId: expense.subCategoryId,
    subCategoryName: expense.subCategoryName,
  };
}

function assertCashAssetUsableForTransfer(
  asset: CsvImportCashflowAssetRecord | null,
  userId: string,
  row: CsvImportCashflowCommitRowInput,
  role: 'source' | 'destination'
): CsvImportCashflowAssetRecord {
  const fieldName = role === 'source' ? 'sourceAccount' : 'destinationAccount';
  const assetId = role === 'source'
    ? row.canonicalFields.sourceAccount
    : row.canonicalFields.destinationAccount;

  if (!asset) {
    throw new CsvImportCashflowCommitServiceError(
      404,
      'Conto cash del transfer non trovato',
      { rowIndex: row.rowIndex, field: fieldName, assetId }
    );
  }

  if (asset.userId !== userId) {
    throw new CsvImportCashflowCommitServiceError(
      403,
      'Conto cash del transfer non appartiene all\'utente autenticato',
      { rowIndex: row.rowIndex, field: fieldName, assetId: asset.id }
    );
  }

  if (asset.assetClass !== 'cash') {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il transfer CSV può usare solo asset di classe cash',
      { rowIndex: row.rowIndex, field: fieldName, assetId: asset.id, assetClass: asset.assetClass }
    );
  }

  return asset;
}

function buildCreatedInternalTransferRecord(
  userId: string,
  batchId: string,
  input: CsvImportCashflowCommitInput,
  row: CsvImportCashflowCommitRowInput,
  generatedTransferId: string,
  now: Date,
  fromAsset: CsvImportCashflowAssetRecord,
  toAsset: CsvImportCashflowAssetRecord
): CsvImportCashflowInternalTransferRecord {
  const amount = Math.abs(row.canonicalFields.amount ?? 0);
  const fees = row.canonicalFields.fees ?? 0;
  const parsedDate = toDate(row.canonicalFields.date);

  return {
    id: generatedTransferId,
    userId,
    batchId,
    rowIndex: row.rowIndex,
    dedupeKey: row.dedupeKey,
    fromCashAssetId: fromAsset.id,
    fromCashAssetName: fromAsset.name,
    toCashAssetId: toAsset.id,
    toCashAssetName: toAsset.name,
    amount,
    currency: (row.canonicalFields.currency ?? fromAsset.currency ?? 'EUR').toUpperCase(),
    date: parsedDate,
    fees,
    purpose: 'neutral_transfer',
    notes: row.canonicalFields.description ?? '',
    importBatchId: batchId,
    importIdempotencyKey: input.idempotencyKey,
    importSourceFingerprint: input.sourceFingerprint ?? null,
    importPresetId: input.presetId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildCreatedTransferSummary(transfer: CsvImportCashflowInternalTransferRecord): CsvImportCashflowCreatedRecord {
  return {
    kind: 'internalTransfer',
    id: transfer.id,
    rowIndex: transfer.rowIndex,
    dedupeKey: transfer.dedupeKey,
    amount: transfer.amount,
    currency: transfer.currency,
    fromCashAssetId: transfer.fromCashAssetId,
    fromCashAssetName: transfer.fromCashAssetName,
    toCashAssetId: transfer.toCashAssetId,
    toCashAssetName: transfer.toCashAssetName,
    fees: transfer.fees,
    purpose: transfer.purpose,
  };
}

function validatePositiveDate(dateValue: string, rowIndex: number): Date {
  const parsedDate = toDate(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Data importata non valida',
      { rowIndex, date: dateValue }
    );
  }

  return parsedDate;
}

export function createCsvImportCashflowCommitService(
  dependencies: Partial<CsvImportCashflowCommitServiceDependencies> = {}
) {
  const repository = dependencies.repository ?? createFirestoreCsvImportCashflowBatchRepository();
  const categoryRepository = dependencies.categoryRepository ?? createFirestoreCsvImportCashflowCategoryRepository();
  const now = dependencies.now ?? (() => new Date());
  const generateId = dependencies.generateId ?? (() => randomUUID());
  const invalidateDashboardOverviewSummaryServer = (
    dependencies.invalidateDashboardOverviewSummaryServer
    ?? defaultInvalidateDashboardOverviewSummaryServer
  );

  return {
    async commitBatch(
      userId: string,
      input: CsvImportCashflowCommitInput
    ): Promise<CsvImportCashflowCommitResult> {
      ensureAuthenticatedUserId(userId);

      if (!input.idempotencyKey?.trim()) {
        throw new CsvImportCashflowCommitServiceError(400, 'Idempotency key obbligatoria');
      }

      if (!Array.isArray(input.rows) || input.rows.length === 0) {
        throw new CsvImportCashflowCommitServiceError(400, 'Nessuna riga da importare');
      }

      const requestFingerprint = buildRequestFingerprint(userId, input);
      const existingBatch = await repository.getByUserAndIdempotencyKey(userId, input.idempotencyKey);
      if (existingBatch) {
        if (existingBatch.requestFingerprint && existingBatch.requestFingerprint !== requestFingerprint) {
          throw new CsvImportCashflowCommitServiceError(
            409,
            'Idempotency key già utilizzata per un payload diverso',
            { batchId: existingBatch.id }
          );
        }

        return {
          batch: existingBatch,
          createdRecordCount: existingBatch.createdRecordCount,
          wasIdempotent: true,
        };
      }

      const committedBatches = await repository.listCommittedByUserId(userId);
      const existingDedupeKeys = new Set<string>();
      committedBatches.forEach((batch) => {
        batch.createdRecords.forEach((record) => existingDedupeKeys.add(record.dedupeKey));
      });

      const preparedRows: PreparedCommitRow[] = input.rows.map((row) => {
        assertSupportedRowIsCommitReady(row);

        return {
          row,
          parsedDate: validatePositiveDate(row.canonicalFields.date as string, row.rowIndex),
        };
      });
      const preparedCashflowRows = preparedRows.filter(
        (prepared): prepared is PreparedCashflowCommitRow => prepared.row.movementKind === 'cashflow'
      );
      let existingExpenseDuplicateKeys = new Set<string>();
      if (preparedCashflowRows.length > 0) {
        const { startDate, endDate } = getDateRangeForRows(preparedCashflowRows);
        const existingExpenses = await repository.listExpensesByUserAndDateRange(userId, startDate, endDate);
        existingExpenseDuplicateKeys = new Set<string>(
          existingExpenses.map((expense) => buildConservativeExpenseDuplicateKey(
            expense.date,
            expense.amount,
            expense.currency ?? 'EUR',
            expense.notes ?? ''
          ))
        );
      }

      const inputDedupeKeys = new Set<string>();
      const createdRecords: CsvImportCashflowCreatedRecord[] = [];
      const createdExpenses: CsvImportCashflowExpenseRecord[] = [];
      const createdTransfers: CsvImportCashflowInternalTransferRecord[] = [];
      const batchCreatedAt = now();
      const batchId = generateId();

      for (const { row, parsedDate } of preparedRows) {
        if (inputDedupeKeys.has(row.dedupeKey)) {
          throw new CsvImportCashflowCommitServiceError(
            409,
            'Duplicato rilevato nel batch di import',
            { rowIndex: row.rowIndex, dedupeKey: row.dedupeKey }
          );
        }

        if (existingDedupeKeys.has(row.dedupeKey)) {
          throw new CsvImportCashflowCommitServiceError(
            409,
            'Riga già presente in un batch import precedentemente confermato',
            { rowIndex: row.rowIndex, dedupeKey: row.dedupeKey }
          );
        }

        if (row.movementKind === 'cashflow') {
          const categoryId = row.categoryId as string;
          const category = await categoryRepository.getById(categoryId);
          if (!category) {
            throw new CsvImportCashflowCommitServiceError(
              404,
              'Categoria confermata non trovata',
              { rowIndex: row.rowIndex, categoryId: row.categoryId }
            );
          }

          if (category.userId !== userId) {
            throw new CsvImportCashflowCommitServiceError(
              403,
              'Categoria non appartiene all\'utente autenticato',
              { rowIndex: row.rowIndex, categoryId: row.categoryId }
            );
          }

          ensureNoCategoryGuessing(row, category);
          assertAmountMatchesCategoryType(row, category);

          const conservativeDuplicateKey = buildConservativeExpenseDuplicateKey(
            parsedDate,
            row.canonicalFields.amount ?? 0,
            row.canonicalFields.currency ?? 'EUR',
            row.canonicalFields.description ?? ''
          );
          if (existingExpenseDuplicateKeys.has(conservativeDuplicateKey)) {
            throw new CsvImportCashflowCommitServiceError(
              409,
              'Riga già presente in un movimento cashflow esistente',
              { rowIndex: row.rowIndex, date: row.canonicalFields.date, amount: row.canonicalFields.amount }
            );
          }

          const subCategory = resolveSubCategory(row, category);
          const generatedExpenseId = generateId();

          const expense = buildCreatedExpenseRecord(
            userId,
            batchId,
            input,
            {
              ...row,
              canonicalFields: {
                ...row.canonicalFields,
                date: formatDateInputValue(parsedDate),
              },
            },
            category,
            generatedExpenseId,
            batchCreatedAt,
            subCategory
          );

          createdRecords.push(buildCreatedRecordSummary(expense));
          createdExpenses.push(expense);
          inputDedupeKeys.add(row.dedupeKey);
          continue;
        }

        const sourceAssetId = row.canonicalFields.sourceAccount as string;
        const destinationAssetId = row.canonicalFields.destinationAccount as string;
        const [sourceAsset, destinationAsset] = await Promise.all([
          repository.getCashAssetById(sourceAssetId),
          repository.getCashAssetById(destinationAssetId),
        ]);
        const fromAsset = assertCashAssetUsableForTransfer(sourceAsset, userId, row, 'source');
        const toAsset = assertCashAssetUsableForTransfer(destinationAsset, userId, row, 'destination');
        const generatedTransferId = generateId();
        const transfer = buildCreatedInternalTransferRecord(
          userId,
          batchId,
          input,
          {
            ...row,
            canonicalFields: {
              ...row.canonicalFields,
              date: formatDateInputValue(parsedDate),
            },
          },
          generatedTransferId,
          batchCreatedAt,
          fromAsset,
          toAsset
        );

        createdRecords.push(buildCreatedTransferSummary(transfer));
        createdTransfers.push(transfer);
        inputDedupeKeys.add(row.dedupeKey);
      }

      const batch: CsvImportCashflowBatch = {
        id: batchId,
        userId,
        idempotencyKey: input.idempotencyKey,
        presetId: input.presetId ?? null,
        sourceFingerprint: input.sourceFingerprint ?? null,
        requestFingerprint,
        status: 'committed',
        rowCount: input.rows.length,
        createdRecordCount: createdRecords.length,
        duplicateCount: 0,
        errorCount: 0,
        createdRecords,
        createdAt: batchCreatedAt,
        committedAt: now(),
        rolledBackAt: null,
        rollbackReason: null,
      };

      await repository.commitBatch(batch, createdRecords, createdExpenses, createdTransfers);
      await invalidateDashboardOverviewSummaryServer(userId, 'csv_import_cashflow_committed');

      return {
        batch,
        createdRecordCount: createdRecords.length,
        wasIdempotent: false,
      };
    },

    async rollbackBatch(
      userId: string,
      batchId: string,
      rollbackReason = 'annullamento manuale'
    ): Promise<CsvImportCashflowRollbackResult> {
      ensureAuthenticatedUserId(userId);

      if (!batchId?.trim()) {
        throw new CsvImportCashflowCommitServiceError(400, 'Batch ID obbligatorio');
      }

      const batch = await repository.getById(batchId);
      if (!batch) {
        throw new CsvImportCashflowCommitServiceError(404, 'Batch import non trovato');
      }

      if (batch.userId !== userId) {
        throw new CsvImportCashflowCommitServiceError(403, 'Batch non appartenente all\'utente autenticato');
      }

      if (batch.status === 'rolledBack') {
        throw new CsvImportCashflowCommitServiceError(409, 'Batch già annullato');
      }

      const expectedCashflowCount = batch.createdRecords.filter((record) => record.kind === 'cashflow').length;
      const expectedTransferCount = batch.createdRecords.filter((record) => record.kind === 'internalTransfer').length;
      const createdExpenses = await repository.listExpensesByBatchId(batchId);
      const createdTransfers = await repository.listInternalTransfersByBatchId(batchId);
      const foundRecordCount = createdExpenses.length + createdTransfers.length;
      if (createdExpenses.length !== expectedCashflowCount || createdTransfers.length !== expectedTransferCount) {
        throw new CsvImportCashflowCommitServiceError(
          409,
          'Il batch non è più sicuro da annullare',
          {
            batchId,
            expected: batch.createdRecordCount,
            found: foundRecordCount,
            expectedCashflowCount,
            expectedTransferCount,
          }
        );
      }

      const unsafeExpense = createdExpenses.find(
        (expense) => expense.updatedAt.getTime() !== expense.createdAt.getTime()
      );

      if (unsafeExpense) {
        throw new CsvImportCashflowCommitServiceError(
          409,
          'Il batch contiene movimenti modificati manualmente e non può essere annullato automaticamente',
          { batchId, expenseId: unsafeExpense.id }
        );
      }

      const unsafeTransfer = createdTransfers.find(
        (transfer) => transfer.updatedAt.getTime() !== transfer.createdAt.getTime()
      );

      if (unsafeTransfer) {
        throw new CsvImportCashflowCommitServiceError(
          409,
          'Il batch contiene transfer modificati manualmente e non può essere annullato automaticamente',
          { batchId, transferId: unsafeTransfer.id }
        );
      }

      const expenseIds = createdExpenses.map((expense) => expense.id);
      const transferIds = createdTransfers.map((transfer) => transfer.id);
      const rolledBackAt = now();
      const updatedBatch = await repository.rollbackBatch(batchId, expenseIds, transferIds, rolledBackAt, rollbackReason);

      if (!updatedBatch) {
        throw new CsvImportCashflowCommitServiceError(404, 'Batch import non trovato');
      }

      await invalidateDashboardOverviewSummaryServer(userId, 'csv_import_cashflow_rolled_back');

      return {
        batch: updatedBatch,
        removedRecordCount: expenseIds.length + transferIds.length,
      };
    },
  };
}

const defaultCsvImportCashflowCommitService = createCsvImportCashflowCommitService();

export async function commitCsvImportCashflowBatch(
  userId: string,
  input: CsvImportCashflowCommitInput
): Promise<CsvImportCashflowCommitResult> {
  return defaultCsvImportCashflowCommitService.commitBatch(userId, input);
}

export async function rollbackCsvImportCashflowBatch(
  userId: string,
  batchId: string,
  rollbackReason?: string
): Promise<CsvImportCashflowRollbackResult> {
  return defaultCsvImportCashflowCommitService.rollbackBatch(userId, batchId, rollbackReason);
}

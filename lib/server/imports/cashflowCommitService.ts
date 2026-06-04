import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { fromZonedTime } from 'date-fns-tz';
import { createFirestoreCsvImportCashflowBatchRepository, createFirestoreCsvImportCashflowCategoryRepository } from '@/lib/server/imports/cashflowCommitRepository';
import { invalidateDashboardOverviewSummaryServer as defaultInvalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { ITALY_TIMEZONE, formatDateInputValue, toDate } from '@/lib/utils/dateHelpers';
import { calculateInvestmentOperationEffect } from '@/lib/utils/investmentOperationUtils';
import type {
  CsvImportCashflowBatch,
  CsvImportCashflowBatchRepository,
  CsvImportCashflowCategoryRepository,
  CsvImportCashflowAssetReference,
  CsvImportCashflowCreatedDividendRecord,
  CsvImportCashflowCreatedInvestmentOperationRecord,
  CsvImportCashflowCommitInput,
  CsvImportCashflowCommitResult,
  CsvImportCashflowCommitRowInput,
  CsvImportCashflowCreatedRecord,
  CsvImportCashflowExpenseRecord,
  CsvImportCashflowDividendRecord,
  CsvImportCashflowInternalTransferRecord,
  CsvImportCashflowInvestmentOperationRecord,
  CsvImportCashflowRollbackResult,
  CsvImportCashflowCategoryRecord,
  CsvImportCashflowAssetRecord,
} from '@/lib/server/imports/cashflowCommitTypes';
import type { DividendType } from '@/types/dividend';
import type { InvestmentOperationType } from '@/types/investments';

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

type InvestmentOperationCommitType = Extract<InvestmentOperationType, 'buy' | 'sell'>;

const DIVIDEND_TYPES = new Set<DividendType>([
  'ordinary',
  'extraordinary',
  'interim',
  'final',
  'coupon',
  'finalPremium',
]);

function normalizeReferenceText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildInvestmentAssetReference(
  row: CsvImportCashflowCommitRowInput
): CsvImportCashflowAssetReference {
  return {
    assetTicker: row.canonicalFields.assetTicker,
    assetIsin: row.canonicalFields.assetIsin,
    assetName: row.canonicalFields.assetName,
  };
}

function hasInvestmentAssetReference(reference: CsvImportCashflowAssetReference): boolean {
  return Boolean(
    reference.assetTicker?.trim() ||
    reference.assetIsin?.trim() ||
    reference.assetName?.trim()
  );
}

function matchesInvestmentAssetReference(
  asset: CsvImportCashflowAssetRecord,
  reference: CsvImportCashflowAssetReference
): boolean {
  const targetTicker = normalizeReferenceText(reference.assetTicker);
  const targetIsin = normalizeReferenceText(reference.assetIsin);
  const targetName = normalizeReferenceText(reference.assetName);

  if (!targetTicker && !targetIsin && !targetName) {
    return false;
  }

  const assetTicker = normalizeReferenceText(asset.ticker);
  const assetIsin = normalizeReferenceText(asset.isin);
  const assetName = normalizeReferenceText(asset.name);

  return (
    (!targetTicker || assetTicker === targetTicker) &&
    (!targetIsin || assetIsin === targetIsin) &&
    (!targetName || assetName === targetName)
  );
}

function cloneAssetRecord(asset: CsvImportCashflowAssetRecord): CsvImportCashflowAssetRecord {
  return { ...asset };
}

function normalizeDividendType(value: string | null | undefined): DividendType | null {
  const normalized = normalizeReferenceText(value);
  return DIVIDEND_TYPES.has(normalized as DividendType) ? (normalized as DividendType) : null;
}

function resolveDividendType(row: CsvImportCashflowCommitRowInput): DividendType {
  const explicitDividendType = normalizeDividendType(row.canonicalFields.dividendType);
  if (explicitDividendType) {
    return explicitDividendType;
  }

  const sourceType = normalizeReferenceText(row.canonicalFields.sourceType);
  if (sourceType === 'coupon') {
    return 'coupon';
  }

  const sourceDividendType = normalizeDividendType(sourceType);
  return sourceDividendType ?? 'ordinary';
}

function resolveDividendDate(
  row: CsvImportCashflowCommitRowInput,
  fieldName: 'paymentDate' | 'exDate',
  fallbackDate: string
): Date {
  const dateValue = fieldName === 'paymentDate'
    ? row.canonicalFields.paymentDate ?? fallbackDate
    : row.canonicalFields.exDate ?? row.canonicalFields.paymentDate ?? fallbackDate;

  return validatePositiveDate(dateValue as string, row.rowIndex);
}

function resolveDividendAmounts(row: CsvImportCashflowCommitRowInput): {
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
} {
  const amount = row.canonicalFields.amount ?? null;
  const grossAmount = row.canonicalFields.grossAmount ?? null;
  const taxAmount = row.canonicalFields.taxAmount ?? null;
  const netAmount = row.canonicalFields.netAmount ?? null;

  const resolvedNetAmount = netAmount
    ?? amount
    ?? (grossAmount !== null && taxAmount !== null ? grossAmount - taxAmount : null);

  const resolvedGrossAmount = grossAmount
    ?? (resolvedNetAmount !== null && taxAmount !== null ? resolvedNetAmount + taxAmount : amount);

  const resolvedTaxAmount = taxAmount
    ?? (resolvedGrossAmount !== null && resolvedNetAmount !== null
      ? resolvedGrossAmount - resolvedNetAmount
      : 0);

  return {
    grossAmount: resolvedGrossAmount ?? 0,
    taxAmount: resolvedTaxAmount,
    netAmount: resolvedNetAmount ?? 0,
  };
}

function resolveDividendQuantity(
  row: CsvImportCashflowCommitRowInput,
  asset: CsvImportCashflowAssetRecord
): number {
  return row.canonicalFields.quantity ?? asset.quantity;
}

function resolveInvestmentOperationType(row: CsvImportCashflowCommitRowInput): InvestmentOperationCommitType {
  const explicitType = normalizeReferenceText(row.canonicalFields.sourceType);
  if (explicitType === 'buy' || explicitType === 'sell') {
    return explicitType;
  }

  if (row.canonicalFields.sourceType !== null && explicitType.length > 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il tipo operazione di investimento deve essere buy o sell',
      { rowIndex: row.rowIndex, sourceType: row.canonicalFields.sourceType }
    );
  }

  const amount = row.canonicalFields.amount;
  if (amount === null || !Number.isFinite(amount) || amount === 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il tipo operazione di investimento non è deducibile dal segno dell\'importo',
      { rowIndex: row.rowIndex, amount }
    );
  }

  return amount < 0 ? 'buy' : 'sell';
}

function resolveInvestmentOperationCashAccount(
  row: CsvImportCashflowCommitRowInput,
  type: InvestmentOperationCommitType
): { fieldName: 'sourceAccount' | 'destinationAccount'; assetId: string | null } {
  const sourceAccount = row.canonicalFields.sourceAccount?.trim() ?? '';
  const destinationAccount = row.canonicalFields.destinationAccount?.trim() ?? '';

  if (type === 'buy') {
    if (sourceAccount) {
      return { fieldName: 'sourceAccount', assetId: sourceAccount };
    }

    if (destinationAccount) {
      return { fieldName: 'destinationAccount', assetId: destinationAccount };
    }

    return { fieldName: 'sourceAccount', assetId: null };
  }

  if (destinationAccount) {
    return { fieldName: 'destinationAccount', assetId: destinationAccount };
  }

  if (sourceAccount) {
    return { fieldName: 'sourceAccount', assetId: sourceAccount };
  }

  return { fieldName: 'destinationAccount', assetId: null };
}

function assertInvestmentOperationRowIsCommitReady(
  row: CsvImportCashflowCommitRowInput
): asserts row is CsvImportCashflowCommitRowInput & { movementKind: 'investmentOperation' } {
  assertRowCommonCommitReady(row);

  if (row.movementKind !== 'investmentOperation') {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La commit import CSV accetta solo righe cashflow, transfer o investimento pronte',
      { rowIndex: row.rowIndex, movementKind: row.movementKind }
    );
  }

  const { date, description, quantity, unitPrice, fees, taxes } = row.canonicalFields;
  if (!date || !description) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga investimento richiede data e descrizione validi',
      { rowIndex: row.rowIndex }
    );
  }

  if (!hasInvestmentAssetReference(buildInvestmentAssetReference(row))) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il riferimento asset confermato è obbligatorio per la riga investimento',
      { rowIndex: row.rowIndex }
    );
  }

  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La quantità dell\'operazione di investimento deve essere maggiore di zero',
      { rowIndex: row.rowIndex, quantity }
    );
  }

  if (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il prezzo unitario dell\'operazione di investimento deve essere maggiore di zero',
      { rowIndex: row.rowIndex, unitPrice }
    );
  }

  if (fees !== null && (!Number.isFinite(fees) || fees < 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Le commissioni dell\'operazione di investimento non sono valide',
      { rowIndex: row.rowIndex, fees }
    );
  }

  if (taxes !== null && (!Number.isFinite(taxes) || taxes < 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Le imposte dell\'operazione di investimento non sono valide',
      { rowIndex: row.rowIndex, taxes }
    );
  }

  resolveInvestmentOperationType(row);
}

function buildCreatedInvestmentOperationRecord(
  userId: string,
  batchId: string,
  input: CsvImportCashflowCommitInput,
  row: CsvImportCashflowCommitRowInput,
  generatedOperationId: string,
  now: Date,
  asset: CsvImportCashflowAssetRecord,
  cashAsset: CsvImportCashflowAssetRecord | null,
  type: InvestmentOperationCommitType,
  effect: ReturnType<typeof calculateInvestmentOperationEffect>
): CsvImportCashflowInvestmentOperationRecord {
  const currency = (row.canonicalFields.currency ?? asset.currency ?? 'EUR').toUpperCase();
  const notes = row.canonicalFields.description ?? '';

  return {
    id: generatedOperationId,
    userId,
    batchId,
    rowIndex: row.rowIndex,
    dedupeKey: row.dedupeKey,
    assetId: asset.id,
    assetName: row.canonicalFields.assetName ?? asset.name,
    assetTicker: row.canonicalFields.assetTicker ?? asset.ticker ?? '',
    type,
    date: toDate(row.canonicalFields.date),
    quantity: row.canonicalFields.quantity ?? 0,
    pricePerUnit: row.canonicalFields.unitPrice ?? 0,
    grossAmount: effect.grossAmount,
    fees: row.canonicalFields.fees ?? 0,
    taxes: row.canonicalFields.taxes ?? 0,
    currency,
    cashAssetId: cashAsset?.id ?? null,
    cashAssetName: cashAsset?.name ?? null,
    previousQuantity: asset.quantity,
    previousAverageCost: asset.averageCost,
    resultingQuantity: effect.resultingQuantity,
    resultingAverageCost: effect.resultingAverageCost,
    realizedGain: effect.realizedGain,
    realizedGainTax: effect.realizedGainTax,
    netCashEffect: effect.netCashEffect,
    notes,
    importBatchId: batchId,
    importRowIndex: row.rowIndex,
    importDedupeKey: row.dedupeKey,
    importIdempotencyKey: input.idempotencyKey,
    importSourceFingerprint: input.sourceFingerprint ?? null,
    importPresetId: input.presetId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildCreatedInvestmentOperationSummary(
  operation: CsvImportCashflowInvestmentOperationRecord
): CsvImportCashflowCreatedInvestmentOperationRecord {
  return {
    kind: 'investmentOperation',
    id: operation.id,
    rowIndex: operation.rowIndex,
    dedupeKey: operation.dedupeKey,
    assetId: operation.assetId,
    assetName: operation.assetName,
    assetTicker: operation.assetTicker,
    type: operation.type,
    quantity: operation.quantity,
    pricePerUnit: operation.pricePerUnit,
    grossAmount: operation.grossAmount,
    fees: operation.fees,
    taxes: operation.taxes,
    currency: operation.currency,
    cashAssetId: operation.cashAssetId,
    cashAssetName: operation.cashAssetName,
    resultingQuantity: operation.resultingQuantity,
    resultingAverageCost: operation.resultingAverageCost,
    realizedGain: operation.realizedGain,
    realizedGainTax: operation.realizedGainTax,
    netCashEffect: operation.netCashEffect,
  };
}

interface ResolvedDividendCommitData {
  paymentDate: Date;
  exDate: Date;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  quantity: number;
  dividendPerShare: number;
  dividendType: DividendType;
  currency: string;
}

function buildCreatedDividendRecord(
  userId: string,
  batchId: string,
  input: CsvImportCashflowCommitInput,
  row: CsvImportCashflowCommitRowInput,
  generatedDividendId: string,
  now: Date,
  asset: CsvImportCashflowAssetRecord,
  resolved: ResolvedDividendCommitData
): CsvImportCashflowDividendRecord {
  const notes = row.canonicalFields.description ?? '';

  return {
    id: generatedDividendId,
    userId,
    batchId,
    rowIndex: row.rowIndex,
    dedupeKey: row.dedupeKey,
    assetId: asset.id,
    assetName: row.canonicalFields.assetName ?? asset.name,
    assetTicker: row.canonicalFields.assetTicker ?? asset.ticker ?? '',
    assetIsin: row.canonicalFields.assetIsin ?? asset.isin ?? null,
    exDate: resolved.exDate,
    paymentDate: resolved.paymentDate,
    dividendPerShare: resolved.dividendPerShare,
    quantity: resolved.quantity,
    grossAmount: resolved.grossAmount,
    taxAmount: resolved.taxAmount,
    netAmount: resolved.netAmount,
    currency: resolved.currency,
    dividendType: resolved.dividendType,
    notes,
    isAutoGenerated: false,
    costPerShare: asset.averageCost,
    linkedMovementReference: row.canonicalFields.linkedMovementReference ?? null,
    importBatchId: batchId,
    importRowIndex: row.rowIndex,
    importDedupeKey: row.dedupeKey,
    importIdempotencyKey: input.idempotencyKey,
    importSourceFingerprint: input.sourceFingerprint ?? null,
    importPresetId: input.presetId ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildCreatedDividendSummary(
  dividend: CsvImportCashflowDividendRecord
): CsvImportCashflowCreatedDividendRecord {
  return {
    kind: 'dividend',
    id: dividend.id,
    rowIndex: dividend.rowIndex,
    dedupeKey: dividend.dedupeKey,
    assetId: dividend.assetId,
    assetName: dividend.assetName,
    assetTicker: dividend.assetTicker,
    assetIsin: dividend.assetIsin,
    exDate: formatDateInputValue(dividend.exDate),
    paymentDate: formatDateInputValue(dividend.paymentDate),
    dividendPerShare: dividend.dividendPerShare,
    quantity: dividend.quantity,
    grossAmount: dividend.grossAmount,
    taxAmount: dividend.taxAmount,
    netAmount: dividend.netAmount,
    currency: dividend.currency,
    dividendType: dividend.dividendType,
    costPerShare: dividend.costPerShare,
    linkedMovementReference: dividend.linkedMovementReference ?? null,
  };
}

interface PreparedCommitRow {
  row: CsvImportCashflowCommitRowInput;
  parsedDate: Date;
}

interface PreparedCashflowCommitRow extends PreparedCommitRow {
  row: CsvImportCashflowCommitRowInput & { movementKind: 'cashflow' | 'fee' | 'tax' };
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
      date: row.canonicalFields.date,
      description: row.canonicalFields.description,
      amount: row.canonicalFields.amount,
      currency: row.canonicalFields.currency,
      sourceType: row.canonicalFields.sourceType,
      sourceAccount: row.canonicalFields.sourceAccount,
      destinationAccount: row.canonicalFields.destinationAccount,
      paymentDate: row.canonicalFields.paymentDate,
      exDate: row.canonicalFields.exDate,
      assetTicker: row.canonicalFields.assetTicker,
      assetIsin: row.canonicalFields.assetIsin,
      assetName: row.canonicalFields.assetName,
      quantity: row.canonicalFields.quantity,
      unitPrice: row.canonicalFields.unitPrice,
      fees: row.canonicalFields.fees,
      taxes: row.canonicalFields.taxes,
      grossAmount: row.canonicalFields.grossAmount,
      taxAmount: row.canonicalFields.taxAmount,
      netAmount: row.canonicalFields.netAmount,
      dividendType: row.canonicalFields.dividendType,
      linkedMovementReference: row.canonicalFields.linkedMovementReference,
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

function assertCashflowLikeRowIsCommitReady(
  row: CsvImportCashflowCommitRowInput
): asserts row is CsvImportCashflowCommitRowInput & { movementKind: 'cashflow' | 'fee' | 'tax' } {
  assertRowCommonCommitReady(row);

  if (row.movementKind !== 'cashflow' && row.movementKind !== 'fee' && row.movementKind !== 'tax') {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La commit import CSV accetta solo righe cashflow, transfer, investimento, dividendo, fee o tax pronte',
      { rowIndex: row.rowIndex, movementKind: row.movementKind }
    );
  }

  if (!row.categoryId?.trim() || !row.categoryName?.trim()) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Categoria confermata obbligatoria per la commit cashflow, fee o tax',
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

function assertDividendRowIsCommitReady(
  row: CsvImportCashflowCommitRowInput
): asserts row is CsvImportCashflowCommitRowInput & { movementKind: 'dividend' } {
  assertRowCommonCommitReady(row);

  if (row.movementKind !== 'dividend') {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La commit import CSV accetta solo righe cashflow, transfer, investimento, dividendo, fee o tax pronte',
      { rowIndex: row.rowIndex, movementKind: row.movementKind }
    );
  }

  const {
    date,
    description,
    amount,
    sourceAccount,
    destinationAccount,
    quantity,
    unitPrice,
    fees,
    taxes,
    grossAmount = null,
    taxAmount = null,
    netAmount = null,
    paymentDate = null,
    exDate = null,
    dividendType,
  } = row.canonicalFields;

  if (!date || !description || amount === null) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga dividendo richiede data, descrizione e importo validi',
      { rowIndex: row.rowIndex }
    );
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Importo dividendo non valido',
      { rowIndex: row.rowIndex, amount }
    );
  }

  if (!hasInvestmentAssetReference(buildInvestmentAssetReference(row))) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il riferimento asset confermato è obbligatorio per la riga dividendo',
      { rowIndex: row.rowIndex }
    );
  }

  if (sourceAccount || destinationAccount) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga dividendo non supporta conti origine o destinazione',
      { rowIndex: row.rowIndex }
    );
  }

  if (unitPrice !== null) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga dividendo non supporta un prezzo unitario',
      { rowIndex: row.rowIndex, unitPrice }
    );
  }

  if (fees !== null) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La riga dividendo non supporta commissioni separate',
      { rowIndex: row.rowIndex, fees }
    );
  }

  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La quantità del dividendo non è valida',
      { rowIndex: row.rowIndex, quantity }
    );
  }

  if (taxes !== null && (!Number.isFinite(taxes) || taxes < 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Le imposte del dividendo non sono valide',
      { rowIndex: row.rowIndex, taxes }
    );
  }

  if (grossAmount !== null && (!Number.isFinite(grossAmount) || grossAmount <= 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il lordo del dividendo non è valido',
      { rowIndex: row.rowIndex, grossAmount }
    );
  }

  if (taxAmount !== null && (!Number.isFinite(taxAmount) || taxAmount < 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Le imposte del dividendo non sono valide',
      { rowIndex: row.rowIndex, taxAmount }
    );
  }

  if (netAmount !== null && (!Number.isFinite(netAmount) || netAmount < 0)) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'Il netto del dividendo non è valido',
      { rowIndex: row.rowIndex, netAmount }
    );
  }

  if (paymentDate !== null && paymentDate.trim().length === 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La data di pagamento del dividendo non è valida',
      { rowIndex: row.rowIndex, paymentDate }
    );
  }

  if (exDate !== null && exDate.trim().length === 0) {
    throw new CsvImportCashflowCommitServiceError(
      400,
      'La data ex-dividendo non è valida',
      { rowIndex: row.rowIndex, exDate }
    );
  }

  normalizeDividendType(dividendType);
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
  if (row.movementKind === 'cashflow' || row.movementKind === 'fee' || row.movementKind === 'tax') {
    assertCashflowLikeRowIsCommitReady(row);
    return;
  }

  if (row.movementKind === 'transfer') {
    assertTransferRowIsCommitReady(row);
    return;
  }

  if (row.movementKind === 'investmentOperation') {
    assertInvestmentOperationRowIsCommitReady(row);
    return;
  }

  if (row.movementKind === 'dividend') {
    assertDividendRowIsCommitReady(row);
    return;
  }

  throw new CsvImportCashflowCommitServiceError(
    400,
    'La commit import CSV accetta solo righe cashflow, transfer, investimento, dividendo, fee o tax pronte',
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
        (prepared): prepared is PreparedCashflowCommitRow => (
          prepared.row.movementKind === 'cashflow'
          || prepared.row.movementKind === 'fee'
          || prepared.row.movementKind === 'tax'
        )
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
      const createdInvestmentOperations: CsvImportCashflowInvestmentOperationRecord[] = [];
      const createdDividends: CsvImportCashflowDividendRecord[] = [];
      const batchCreatedAt = now();
      const batchId = generateId();
      const assetCacheById = new Map<string, CsvImportCashflowAssetRecord>();

      function cacheAsset(asset: CsvImportCashflowAssetRecord): CsvImportCashflowAssetRecord {
        const cachedAsset = cloneAssetRecord(asset);
        assetCacheById.set(cachedAsset.id, cachedAsset);
        return cachedAsset;
      }

      function getCachedAssetById(assetId: string): CsvImportCashflowAssetRecord | null {
        return assetCacheById.get(assetId) ?? null;
      }

      function findCachedInvestmentAssetByReference(
        reference: CsvImportCashflowAssetReference
      ): CsvImportCashflowAssetRecord | null {
        return Array.from(assetCacheById.values()).find((asset) => (
          asset.assetClass !== 'cash' && matchesInvestmentAssetReference(asset, reference)
        )) ?? null;
      }

      async function resolveInvestmentAsset(
        reference: CsvImportCashflowAssetReference
      ): Promise<CsvImportCashflowAssetRecord> {
        const cachedAsset = findCachedInvestmentAssetByReference(reference);
        if (cachedAsset) {
          return cachedAsset;
        }

        const resolvedAsset = await repository.getInvestmentAssetByConfirmedReference(userId, reference);
        if (!resolvedAsset) {
          throw new CsvImportCashflowCommitServiceError(
            404,
            'Asset di investimento confermato non trovato',
            { reference }
          );
        }

        if (resolvedAsset.userId !== userId) {
          throw new CsvImportCashflowCommitServiceError(
            403,
            'Asset di investimento non appartiene all\'utente autenticato',
            { assetId: resolvedAsset.id }
          );
        }

        if (resolvedAsset.assetClass === 'cash') {
          throw new CsvImportCashflowCommitServiceError(
            400,
            'La riga investimento richiede un asset non cash',
            { assetId: resolvedAsset.id, assetClass: resolvedAsset.assetClass }
          );
        }

        return cacheAsset(resolvedAsset);
      }

      async function resolveCashAsset(
        assetId: string | null,
        row: CsvImportCashflowCommitRowInput,
        role: 'source' | 'destination'
      ): Promise<CsvImportCashflowAssetRecord | null> {
        if (!assetId) {
          return null;
        }

        const cachedAsset = getCachedAssetById(assetId);
        if (cachedAsset) {
          return assertCashAssetUsableForTransfer(cachedAsset, userId, row, role);
        }

        const resolvedAsset = await repository.getCashAssetById(assetId);
        if (!resolvedAsset) {
          return assertCashAssetUsableForTransfer(resolvedAsset, userId, row, role);
        }

        return cacheAsset(assertCashAssetUsableForTransfer(resolvedAsset, userId, row, role));
      }

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

        if (row.movementKind === 'investmentOperation') {
          const type = resolveInvestmentOperationType(row);
          const assetReference = buildInvestmentAssetReference(row);
          const asset = await resolveInvestmentAsset(assetReference);
          const cashAccount = resolveInvestmentOperationCashAccount(row, type);
          const cashAsset = await resolveCashAsset(
            cashAccount.assetId,
            row,
            cashAccount.fieldName === 'sourceAccount' ? 'source' : 'destination'
          );

          let effect: ReturnType<typeof calculateInvestmentOperationEffect>;
          try {
            effect = calculateInvestmentOperationEffect({
              type,
              previousQuantity: asset.quantity,
              previousAverageCost: asset.averageCost,
              quantity: row.canonicalFields.quantity ?? 0,
              pricePerUnit: row.canonicalFields.unitPrice ?? 0,
              fees: row.canonicalFields.fees ?? 0,
              taxes: row.canonicalFields.taxes ?? 0,
            });
          } catch (error) {
            const message = error instanceof Error && error.message.includes('Cannot sell more quantity than currently owned')
              ? 'La quantità venduta supera quella disponibile'
              : 'Operazione di investimento non valida';

            throw new CsvImportCashflowCommitServiceError(
              400,
              message,
              { rowIndex: row.rowIndex, assetId: asset.id }
            );
          }

          const generatedOperationId = generateId();
          const operation = buildCreatedInvestmentOperationRecord(
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
            generatedOperationId,
            batchCreatedAt,
            asset,
            cashAsset,
            type,
            effect
          );

          createdRecords.push(buildCreatedInvestmentOperationSummary(operation));
          createdInvestmentOperations.push(operation);
          cacheAsset({
            ...asset,
            quantity: effect.resultingQuantity,
            averageCost: effect.resultingAverageCost,
            updatedAt: batchCreatedAt,
          });

          if (cashAsset && Math.abs(effect.netCashEffect) > 0.000001) {
            cacheAsset({
              ...cashAsset,
              quantity: cashAsset.quantity + effect.netCashEffect,
              updatedAt: batchCreatedAt,
            });
          }

          inputDedupeKeys.add(row.dedupeKey);
          continue;
        }

        if (row.movementKind === 'dividend') {
          const assetReference = buildInvestmentAssetReference(row);
          const asset = await resolveInvestmentAsset(assetReference);
          const paymentDate = resolveDividendDate(row, 'paymentDate', row.canonicalFields.date as string);
          const exDate = resolveDividendDate(row, 'exDate', row.canonicalFields.date as string);
          const resolvedAmounts = resolveDividendAmounts(row);
          const quantity = resolveDividendQuantity(row, asset);
          const dividendPerShare = quantity > 0 ? resolvedAmounts.grossAmount / quantity : 0;
          const dividendType = resolveDividendType(row);
          const currency = (row.canonicalFields.currency ?? asset.currency ?? 'EUR').toUpperCase();
          const generatedDividendId = generateId();
          const dividend = buildCreatedDividendRecord(
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
            generatedDividendId,
            batchCreatedAt,
            asset,
            {
              paymentDate,
              exDate,
              grossAmount: resolvedAmounts.grossAmount,
              taxAmount: resolvedAmounts.taxAmount,
              netAmount: resolvedAmounts.netAmount,
              quantity,
              dividendPerShare,
              dividendType,
              currency,
            }
          );

          createdRecords.push(buildCreatedDividendSummary(dividend));
          createdDividends.push(dividend);
          inputDedupeKeys.add(row.dedupeKey);
          continue;
        }

        if (row.movementKind === 'fee' || row.movementKind === 'tax') {
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

      await repository.commitBatch(
        batch,
        createdRecords,
        createdExpenses,
        createdTransfers,
        createdInvestmentOperations,
        createdDividends
      );
      await invalidateDashboardOverviewSummaryServer(userId, 'csv_import_cashflow_committed');

      return {
        batch,
        createdRecordCount: createdRecords.length,
        wasIdempotent: false,
      };
    },

    async listImportBatches(userId: string): Promise<CsvImportCashflowBatch[]> {
      ensureAuthenticatedUserId(userId);

      const batches = await repository.listByUserId(userId);
      return batches
        .filter((batch) => batch.status === 'committed' || batch.status === 'rolledBack')
        .sort((left, right) => (
          right.committedAt.getTime() - left.committedAt.getTime()
          || right.createdAt.getTime() - left.createdAt.getTime()
        ));
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
      const expectedInvestmentOperationCount = batch.createdRecords.filter((record) => record.kind === 'investmentOperation').length;
      const expectedDividendCount = batch.createdRecords.filter((record) => record.kind === 'dividend').length;
      const createdExpenses = await repository.listExpensesByBatchId(batchId);
      const createdTransfers = await repository.listInternalTransfersByBatchId(batchId);
      const createdInvestmentOperations = await repository.listInvestmentOperationsByBatchId(batchId);
      const createdDividends = await repository.listDividendsByBatchId(batchId);
      const foundRecordCount = createdExpenses.length + createdTransfers.length + createdInvestmentOperations.length + createdDividends.length;
      if (
        createdExpenses.length !== expectedCashflowCount
        || createdTransfers.length !== expectedTransferCount
        || createdInvestmentOperations.length !== expectedInvestmentOperationCount
        || createdDividends.length !== expectedDividendCount
      ) {
        throw new CsvImportCashflowCommitServiceError(
          409,
          'Il batch non è più sicuro da annullare',
          {
            batchId,
            expected: batch.createdRecordCount,
            found: foundRecordCount,
            expectedCashflowCount,
            expectedTransferCount,
            expectedInvestmentOperationCount,
            expectedDividendCount,
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

      const unsafeDividend = createdDividends.find(
        (dividend) => dividend.updatedAt.getTime() !== dividend.createdAt.getTime()
      );

      if (unsafeDividend) {
        throw new CsvImportCashflowCommitServiceError(
          409,
          'Il batch contiene dividendi modificati manualmente e non può essere annullato automaticamente',
          { batchId, dividendId: unsafeDividend.id }
        );
      }

      const currentAssetsById = new Map<string, CsvImportCashflowAssetRecord>();
      const orderedInvestmentOperations = [...createdInvestmentOperations].sort(
        (left, right) => left.rowIndex - right.rowIndex
      );
      for (const operation of orderedInvestmentOperations.reverse()) {
        if (operation.updatedAt.getTime() !== operation.createdAt.getTime()) {
          throw new CsvImportCashflowCommitServiceError(
            409,
            'Il batch contiene operazioni di investimento modificate manualmente e non può essere annullato automaticamente',
            { batchId, operationId: operation.id }
          );
        }

        const currentAsset = currentAssetsById.get(operation.assetId) ?? await repository.getAssetById(operation.assetId);
        if (!currentAsset || currentAsset.userId !== userId) {
          throw new CsvImportCashflowCommitServiceError(
            409,
            'Il batch non è più sicuro da annullare',
            { batchId, operationId: operation.id, assetId: operation.assetId }
          );
        }

        if (Math.abs(currentAsset.quantity - operation.resultingQuantity) > 0.000001) {
          throw new CsvImportCashflowCommitServiceError(
            409,
            'Il batch contiene operazioni di investimento modificate manualmente e non può essere annullato automaticamente',
            { batchId, operationId: operation.id, assetId: operation.assetId }
          );
        }

        currentAssetsById.set(operation.assetId, {
          ...currentAsset,
          quantity: operation.previousQuantity,
          averageCost: operation.previousAverageCost,
          updatedAt: operation.createdAt,
        });
      }

      const expenseIds = createdExpenses.map((expense) => expense.id);
      const transferIds = createdTransfers.map((transfer) => transfer.id);
      const investmentOperationIds = createdInvestmentOperations.map((operation) => operation.id);
      const dividendIds = createdDividends.map((dividend) => dividend.id);
      const rolledBackAt = now();
      const updatedBatch = await repository.rollbackBatch(
        batchId,
        expenseIds,
        transferIds,
        investmentOperationIds,
        dividendIds,
        rolledBackAt,
        rollbackReason
      );

      if (!updatedBatch) {
        throw new CsvImportCashflowCommitServiceError(404, 'Batch import non trovato');
      }

      await invalidateDashboardOverviewSummaryServer(userId, 'csv_import_cashflow_rolled_back');

      return {
        batch: updatedBatch,
        removedRecordCount: expenseIds.length + transferIds.length + investmentOperationIds.length + dividendIds.length,
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

export async function listCsvImportCashflowBatches(
  userId: string
): Promise<CsvImportCashflowBatch[]> {
  return defaultCsvImportCashflowCommitService.listImportBatches(userId);
}

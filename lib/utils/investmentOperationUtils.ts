import type { InvestmentOperation, InvestmentOperationFormData } from '@/types/investments';

function assertFinitePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }
}

export interface InvestmentOperationEffectInput {
  type: InvestmentOperationFormData['type'];
  previousQuantity: number;
  previousAverageCost?: number;
  quantity: number;
  pricePerUnit: number;
  fees?: number;
  taxes?: number;
}

export interface InvestmentOperationEffect {
  grossAmount: number;
  resultingQuantity: number;
  resultingAverageCost?: number;
  realizedGain?: number;
  realizedGainTax?: number;
  netCashEffect: number;
}

export function calculateInvestmentOperationEffect(input: InvestmentOperationEffectInput): InvestmentOperationEffect {
  assertFinitePositive(input.quantity, 'quantity');
  assertFinitePositive(input.pricePerUnit, 'pricePerUnit');

  const fees = input.fees ?? 0;
  const taxes = input.taxes ?? 0;
  if (fees < 0 || taxes < 0) {
    throw new Error('fees and taxes cannot be negative');
  }

  const grossAmount = input.quantity * input.pricePerUnit;

  if (input.type === 'buy' || input.type === 'contribution') {
    const resultingQuantity = input.previousQuantity + input.quantity;
    const previousCostBasis = input.previousQuantity * (input.previousAverageCost ?? input.pricePerUnit);
    const addedCostBasis = grossAmount + fees + taxes;

    return {
      grossAmount,
      resultingQuantity,
      resultingAverageCost: resultingQuantity > 0
        ? (previousCostBasis + addedCostBasis) / resultingQuantity
        : undefined,
      netCashEffect: -(grossAmount + fees + taxes),
    };
  }

  if (input.type === 'sell' || input.type === 'withdrawal') {
    if (input.quantity > input.previousQuantity) {
      throw new Error('Cannot sell more quantity than currently owned');
    }

    const costBasis = input.quantity * (input.previousAverageCost ?? 0);
    const realizedGain = grossAmount - fees - costBasis;
    const resultingQuantity = input.previousQuantity - input.quantity;

    return {
      grossAmount,
      resultingQuantity,
      resultingAverageCost: resultingQuantity > 0 ? input.previousAverageCost : undefined,
      realizedGain,
      realizedGainTax: taxes,
      netCashEffect: grossAmount - fees - taxes,
    };
  }

  return {
    grossAmount,
    resultingQuantity: input.previousQuantity,
    resultingAverageCost: input.previousAverageCost,
    netCashEffect: -(fees + taxes),
  };
}

export function calculateInternalTransferEffect(amount: number, fees = 0) {
  assertFinitePositive(amount, 'amount');
  if (fees < 0) throw new Error('fees cannot be negative');

  return {
    fromCashDelta: -amount - fees,
    toCashDelta: amount,
  };
}

const EPSILON = 0.000001;

function toDateValue(value: Date | { toDate(): Date }): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return new Date(0);
}

function optionalNumbersEqual(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) < EPSILON;
}

function numbersEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

export function compareInvestmentOperationsForLedger(a: InvestmentOperation, b: InvestmentOperation): number {
  const dateDiff = toDateValue(a.date).getTime() - toDateValue(b.date).getTime();
  if (dateDiff !== 0) return dateDiff;

  const createdAtDiff = toDateValue(a.createdAt).getTime() - toDateValue(b.createdAt).getTime();
  if (createdAtDiff !== 0) return createdAtDiff;

  return a.id.localeCompare(b.id, 'it');
}

export interface ReplayInvestmentOperationLedgerInput {
  operations: InvestmentOperation[];
  editedOperationId: string;
  editedOperation: InvestmentOperationFormData;
}

export interface ReplayedInvestmentOperation {
  id: string;
  date: Date;
  type: InvestmentOperation['type'];
  quantity: number;
  pricePerUnit: number;
  grossAmount: number;
  fees: number;
  taxes: number;
  currency: string;
  cashAssetId?: string;
  notes?: string;
  previousQuantity: number;
  previousAverageCost?: number;
  resultingQuantity: number;
  resultingAverageCost?: number;
  realizedGain?: number;
  realizedGainTax?: number;
  netCashEffect: number;
  hasChanges: boolean;
}

export interface ReplayInvestmentOperationLedgerResult {
  operations: ReplayedInvestmentOperation[];
  finalQuantity: number;
  finalAverageCost?: number;
  cashDeltasByAssetId: Record<string, number>;
}

export function replayInvestmentOperationLedger(
  input: ReplayInvestmentOperationLedgerInput
): ReplayInvestmentOperationLedgerResult {
  if (input.operations.length === 0) {
    throw new Error('No operations found for this asset');
  }

  const sortedExisting = [...input.operations].sort(compareInvestmentOperationsForLedger);
  const baselineOperation = sortedExisting[0];
  const baselineQuantity = baselineOperation.previousQuantity ?? 0;
  const baselineAverageCost = baselineOperation.previousAverageCost;

  let editedFound = false;
  const projectedOperations = input.operations.map(operation => {
    if (operation.id !== input.editedOperationId) {
      return {
        ...operation,
        date: toDateValue(operation.date),
      };
    }

    editedFound = true;
    return {
      ...operation,
      type: input.editedOperation.type,
      date: input.editedOperation.date,
      quantity: input.editedOperation.quantity,
      pricePerUnit: input.editedOperation.pricePerUnit,
      fees: input.editedOperation.fees ?? 0,
      taxes: input.editedOperation.taxes ?? 0,
      currency: input.editedOperation.currency || operation.currency,
      cashAssetId: input.editedOperation.cashAssetId,
      notes: input.editedOperation.notes,
    };
  });

  if (!editedFound) {
    throw new Error('Operation not found');
  }

  const replayOrder = projectedOperations.sort(compareInvestmentOperationsForLedger);

  let previousQuantity = baselineQuantity;
  let previousAverageCost = baselineAverageCost;
  const oldContributions = new Map<string, number>();
  const newContributions = new Map<string, number>();
  const operations: ReplayedInvestmentOperation[] = [];
  const originalById = new Map(input.operations.map(operation => [operation.id, operation]));

  for (const operation of input.operations) {
    if (!operation.cashAssetId) continue;
    oldContributions.set(
      operation.cashAssetId,
      (oldContributions.get(operation.cashAssetId) ?? 0) + operation.netCashEffect
    );
  }

  for (const operation of replayOrder) {
    const fees = operation.fees ?? 0;
    const taxes = operation.taxes ?? 0;
    const effect = calculateInvestmentOperationEffect({
      type: operation.type,
      previousQuantity,
      previousAverageCost,
      quantity: operation.quantity,
      pricePerUnit: operation.pricePerUnit,
      fees,
      taxes,
    });

    const original = originalById.get(operation.id);
    const replayed: ReplayedInvestmentOperation = {
      id: operation.id,
      date: toDateValue(operation.date),
      type: operation.type,
      quantity: operation.quantity,
      pricePerUnit: operation.pricePerUnit,
      grossAmount: effect.grossAmount,
      fees,
      taxes,
      currency: operation.currency,
      cashAssetId: operation.cashAssetId,
      notes: operation.notes,
      previousQuantity,
      previousAverageCost,
      resultingQuantity: effect.resultingQuantity,
      resultingAverageCost: effect.resultingAverageCost,
      realizedGain: effect.realizedGain,
      realizedGainTax: effect.realizedGainTax,
      netCashEffect: effect.netCashEffect,
      hasChanges: !original
        || original.type !== operation.type
        || toDateValue(original.date).getTime() !== toDateValue(operation.date).getTime()
        || !numbersEqual(original.quantity, operation.quantity)
        || !numbersEqual(original.pricePerUnit, operation.pricePerUnit)
        || !numbersEqual(original.grossAmount, effect.grossAmount)
        || !numbersEqual(original.fees ?? 0, fees)
        || !numbersEqual(original.taxes ?? 0, taxes)
        || original.currency !== operation.currency
        || (original.cashAssetId ?? undefined) !== (operation.cashAssetId ?? undefined)
        || (original.notes ?? undefined) !== (operation.notes ?? undefined)
        || !numbersEqual(original.previousQuantity, previousQuantity)
        || !optionalNumbersEqual(original.previousAverageCost, previousAverageCost)
        || !numbersEqual(original.resultingQuantity, effect.resultingQuantity)
        || !optionalNumbersEqual(original.resultingAverageCost, effect.resultingAverageCost)
        || !optionalNumbersEqual(original.realizedGain, effect.realizedGain)
        || !optionalNumbersEqual(original.realizedGainTax, effect.realizedGainTax)
        || !numbersEqual(original.netCashEffect, effect.netCashEffect),
    };

    if (replayed.cashAssetId) {
      newContributions.set(
        replayed.cashAssetId,
        (newContributions.get(replayed.cashAssetId) ?? 0) + replayed.netCashEffect
      );
    }

    operations.push(replayed);
    previousQuantity = effect.resultingQuantity;
    previousAverageCost = effect.resultingAverageCost;
  }

  const cashDeltasByAssetId: Record<string, number> = {};
  const cashIds = new Set([...oldContributions.keys(), ...newContributions.keys()]);
  for (const cashId of cashIds) {
    const delta = (newContributions.get(cashId) ?? 0) - (oldContributions.get(cashId) ?? 0);
    if (Math.abs(delta) < EPSILON) continue;
    cashDeltasByAssetId[cashId] = delta;
  }

  return {
    operations,
    finalQuantity: previousQuantity,
    finalAverageCost: previousAverageCost,
    cashDeltasByAssetId,
  };
}

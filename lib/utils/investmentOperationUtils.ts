import { InvestmentOperationFormData } from '@/types/investments';

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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  calculateInternalTransferEffect,
  calculateInvestmentOperationEffect,
} from '@/lib/utils/investmentOperationUtils';

describe('calculateInvestmentOperationEffect', () => {
  it('updates weighted average cost for buys including fees and taxes', () => {
    const result = calculateInvestmentOperationEffect({
      type: 'buy',
      previousQuantity: 10,
      previousAverageCost: 100,
      quantity: 5,
      pricePerUnit: 120,
      fees: 3,
      taxes: 2,
    });

    expect(result.grossAmount).toBe(600);
    expect(result.resultingQuantity).toBe(15);
    expect(result.resultingAverageCost).toBeCloseTo((1000 + 605) / 15, 6);
    expect(result.netCashEffect).toBe(-605);
    expect(result.realizedGain).toBeUndefined();
  });

  it('keeps average cost unchanged and records realized gain for partial sells', () => {
    const result = calculateInvestmentOperationEffect({
      type: 'sell',
      previousQuantity: 10,
      previousAverageCost: 80,
      quantity: 4,
      pricePerUnit: 100,
      fees: 5,
      taxes: 10,
    });

    expect(result.grossAmount).toBe(400);
    expect(result.resultingQuantity).toBe(6);
    expect(result.resultingAverageCost).toBe(80);
    expect(result.realizedGain).toBe(75);
    expect(result.realizedGainTax).toBe(10);
    expect(result.netCashEffect).toBe(385);
  });

  it('clears average cost when a sell closes the whole position', () => {
    const result = calculateInvestmentOperationEffect({
      type: 'sell',
      previousQuantity: 3,
      previousAverageCost: 50,
      quantity: 3,
      pricePerUnit: 40,
    });

    expect(result.resultingQuantity).toBe(0);
    expect(result.resultingAverageCost).toBeUndefined();
    expect(result.realizedGain).toBe(-30);
  });

  it('rejects overselling', () => {
    expect(() => calculateInvestmentOperationEffect({
      type: 'sell',
      previousQuantity: 2,
      previousAverageCost: 50,
      quantity: 3,
      pricePerUnit: 40,
    })).toThrow('Cannot sell more quantity than currently owned');
  });
});

describe('calculateInternalTransferEffect', () => {
  it('moves cash between accounts and charges fees only to the source account', () => {
    expect(calculateInternalTransferEffect(1000, 2.5)).toEqual({
      fromCashDelta: -1002.5,
      toCashDelta: 1000,
    });
  });
});

describe('investment operation service regression guards', () => {
  it('does not pre-validate create operations with a synthetic zero previous quantity', () => {
    const source = readFileSync('lib/services/investmentOperationService.ts', 'utf8');
    const createBlock = source.match(
      /export async function createInvestmentOperation[\s\S]*?const fees = input\.fees \?\? 0;/
    );

    expect(createBlock?.[0]).toBeDefined();
    expect(createBlock?.[0]).not.toContain('previousQuantity: 0');
  });
});

import { authenticatedFetch } from '@/lib/utils/authFetch';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { appendHouseholdAuditEntrySafe } from '@/lib/services/householdService';
import { Asset, AssetFormData } from '@/types/assets';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Define asset class ordering priority
 * Order: Azioni → Obbligazioni → Commodities → Real Estate → Cash → Crypto
 */
export const ASSET_CLASS_ORDER: Record<string, number> = {
  equity: 1,
  bonds: 2,
  commodity: 3,
  realestate: 4,
  cash: 5,
  crypto: 6,
};

type DateInput = Date | string | { toDate: () => Date } | null | undefined;

function toDate(value: DateInput): Date {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && 'toDate' in value) {
    return value.toDate();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function mapAsset(input: Asset): Asset {
  return {
    ...input,
    lastPriceUpdate: toDate(input.lastPriceUpdate as DateInput),
    createdAt: toDate(input.createdAt as DateInput),
    updatedAt: toDate(input.updatedAt as DateInput),
  };
}

function mapAssets(input: Asset[]): Asset[] {
  return input
    .map(mapAsset)
    .sort((a, b) => {
      const orderA = ASSET_CLASS_ORDER[a.assetClass] || 999;
      const orderB = ASSET_CLASS_ORDER[b.assetClass] || 999;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return a.name.localeCompare(b.name);
    });
}

async function parseJsonResponse<T>(response: Response, fallbackError: string): Promise<T> {
  const payload = await response.json().catch(() => null) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : fallbackError
    );
  }

  return payload as T;
}

function buildAssetFormData(asset: Asset): AssetFormData {
  return {
    ticker: asset.ticker,
    name: asset.name,
    type: asset.type,
    assetClass: asset.assetClass,
    subCategory: asset.subCategory,
    currency: asset.currency,
    quantity: asset.quantity,
    averageCost: asset.averageCost,
    taxRate: asset.taxRate,
    totalExpenseRatio: asset.totalExpenseRatio,
    stampDutyExempt: asset.stampDutyExempt,
    includeInHistoryTables: asset.includeInHistoryTables,
    currentPrice: asset.currentPrice,
    currentPriceEur: asset.currentPriceEur,
    isLiquid: asset.isLiquid,
    autoUpdatePrice: asset.autoUpdatePrice,
    composition: asset.composition,
    outstandingDebt: asset.outstandingDebt,
    isPrimaryResidence: asset.isPrimaryResidence,
    isin: asset.isin,
    bondDetails: asset.bondDetails,
    pensionFundDetails: asset.pensionFundDetails,
    ownershipProfileId: asset.ownershipProfileId,
    ownershipProfileName: asset.ownershipProfileName,
    ownershipSplits: asset.ownershipSplits,
  };
}

/**
 * Get all assets for a specific user
 * Assets are sorted by asset class (equity, bonds, realestate, crypto, commodity, cash)
 * and then by name within each class
 */
export async function getAllAssets(userId: string): Promise<Asset[]> {
  try {
    const response = await authenticatedFetch('/api/assets', {
      method: 'GET',
    });

    const assets = await parseJsonResponse<Asset[]>(response, 'Errore nel caricamento asset.');
    return mapAssets(assets);
  } catch (error) {
    console.error('Failed to fetch assets', {
      userId,
      operation: 'getAllAssets',
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to fetch assets for user ${userId}`, { cause: error });
  }
}

/**
 * Get all equity assets with ISIN for a specific user
 * Used for automatic dividend scraping
 * Filters: assetClass === 'equity' AND isin exists AND isin is not empty
 */
export async function getAssetsWithIsin(userId: string): Promise<Asset[]> {
  try {
    const response = await authenticatedFetch('/api/assets', {
      method: 'GET',
    });

    const assets = await parseJsonResponse<Asset[]>(response, 'Errore nel caricamento asset.');

    return mapAssets(assets).filter((asset) => (
      asset.assetClass === 'equity' &&
      typeof asset.isin === 'string' &&
      asset.isin.trim() !== ''
    ));
  } catch (error) {
    console.error('Failed to fetch assets with ISIN', {
      userId,
      operation: 'getAssetsWithIsin',
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to fetch assets with ISIN for user ${userId}`, { cause: error });
  }
}

/**
 * Get a single asset by ID
 */
export async function getAssetById(assetId: string): Promise<Asset | null> {
  try {
    const response = await authenticatedFetch(`/api/assets/${assetId}`, {
      method: 'GET',
    });

    if (response.status === 404) {
      return null;
    }

    const asset = await parseJsonResponse<Asset>(response, 'Errore nel caricamento asset.');
    return mapAsset(asset);
  } catch (error) {
    console.error('Failed to fetch asset', {
      assetId,
      operation: 'getAssetById',
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to fetch asset ${assetId}`, { cause: error });
  }
}

/**
 * Create a new asset
 */
export async function createAsset(
  userId: string,
  assetData: AssetFormData
): Promise<string> {
  try {
    const response = await authenticatedFetch('/api/assets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(assetData),
    });

    const createdAsset = await parseJsonResponse<Asset>(response, 'Errore nel salvataggio asset.');
    const asset = mapAsset(createdAsset);

    await invalidateDashboardOverviewSummary(userId, 'asset_created');
    appendHouseholdAuditEntrySafe(userId, {
      entityType: 'asset',
      entityId: asset.id,
      action: 'create',
      summary: `Asset creato: ${assetData.name}`,
      after: {
        name: assetData.name,
        ownershipProfileId: assetData.ownershipProfileId,
        ownershipProfileName: assetData.ownershipProfileName,
      },
    });

    return asset.id;
  } catch (error) {
    console.error('Failed to create asset', {
      userId,
      operation: 'createAsset',
      assetName: assetData.name,
      assetClass: assetData.assetClass,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to create asset for user ${userId}`, { cause: error });
  }
}

/**
 * Update an existing asset
 */
export async function updateAsset(
  assetId: string,
  updates: Partial<AssetFormData>
): Promise<void> {
  try {
    const existingAsset = await getAssetById(assetId);

    if (!existingAsset) {
      throw new Error('Asset non trovato.');
    }

    const payload: AssetFormData = {
      ...buildAssetFormData(existingAsset),
      ...updates,
    };

    const response = await authenticatedFetch(`/api/assets/${assetId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await parseJsonResponse<Asset>(response, 'Errore asset.');

    await invalidateDashboardOverviewSummary(existingAsset.userId, 'asset_updated');
    appendHouseholdAuditEntrySafe(existingAsset.userId, {
      entityType: 'asset',
      entityId: assetId,
      action: 'update',
      summary: `Asset aggiornato: ${updates.name ?? existingAsset.name ?? assetId}`,
      before: {
        ownershipProfileId: existingAsset.ownershipProfileId,
        ownershipProfileName: existingAsset.ownershipProfileName,
      },
      after: {
        ownershipProfileId: updates.ownershipProfileId,
        ownershipProfileName: updates.ownershipProfileName,
      },
    });
  } catch (error) {
    console.error('Failed to update asset', {
      assetId,
      operation: 'updateAsset',
      updateKeys: Object.keys(updates),
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to update asset ${assetId}`, { cause: error });
  }
}

/**
 * Update asset price and timestamp
 */
export async function updateAssetPrice(
  assetId: string,
  price: number
): Promise<void> {
  try {
    const asset = await getAssetById(assetId);

    if (!asset) {
      throw new Error('Asset non trovato.');
    }

    const payload: AssetFormData = {
      ...buildAssetFormData(asset),
      currentPrice: price,
    };

    const response = await authenticatedFetch(`/api/assets/${assetId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await parseJsonResponse<Asset>(response, 'Errore asset.');
    await invalidateDashboardOverviewSummary(asset.userId, 'asset_price_updated');
  } catch (error) {
    console.error('Failed to update asset price', {
      assetId,
      operation: 'updateAssetPrice',
      price,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to update asset price for ${assetId}`, { cause: error });
  }
}

/**
 * Update a cash asset's balance by applying a signed delta.
 *
 * Used when a cashflow transaction is created, edited, or deleted to keep
 * the linked cash asset's balance in sync.
 *
 * Formula: newPrice = (currentPrice * quantity + signedDelta) / quantity
 * Works correctly for any quantity (typically 1 for simple bank accounts).
 * No clamping: allows negative values (overdraft scenario).
 *
 * @param assetId - ID of the cash asset to update
 * @param signedDelta - Amount to add (positive = increase, negative = decrease)
 */
export async function updateCashAssetBalance(assetId: string, signedDelta: number): Promise<void> {
  try {
    const asset = await getAssetById(assetId);
    if (!asset) {
      // Asset may have been deleted — keep the expense flow non-blocking but make the fallback explicit.
      console.warn('Skipping cash asset balance update because linked asset was not found', {
        assetId,
        operation: 'updateCashAssetBalance',
        signedDelta,
      });
      return;
    }

    const payload: AssetFormData = {
      ...buildAssetFormData(asset),
      quantity: asset.quantity + signedDelta,
    };

    const response = await authenticatedFetch(`/api/assets/${assetId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await parseJsonResponse<Asset>(response, 'Errore asset.');
    await invalidateDashboardOverviewSummary(asset.userId, 'cash_asset_balance_updated');
  } catch (error) {
    console.error('Failed to update cash asset balance', {
      assetId,
      operation: 'updateCashAssetBalance',
      signedDelta,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to update cash asset balance for ${assetId}`, { cause: error });
  }
}

/**
 * Update a non-cash asset's quantity by applying a signed delta.
 *
 * Used by cashflow entries that represent an external contribution/withdrawal
 * tied to a specific investment asset. Price and cost basis are intentionally
 * not changed here: the cashflow entry only records the quantity movement.
 */
export async function updateInvestmentAssetQuantity(assetId: string, signedQuantityDelta: number): Promise<void> {
  try {
    const asset = await getAssetById(assetId);
    if (!asset) {
      console.warn('Skipping investment asset quantity update because linked asset was not found', {
        assetId,
        operation: 'updateInvestmentAssetQuantity',
        signedQuantityDelta,
      });
      return;
    }

    if (asset.assetClass === 'cash') {
      console.warn('Skipping investment quantity update for cash asset', {
        assetId,
        operation: 'updateInvestmentAssetQuantity',
      });
      return;
    }

    const payload: AssetFormData = {
      ...buildAssetFormData(asset),
      quantity: asset.quantity + signedQuantityDelta,
    };

    const response = await authenticatedFetch(`/api/assets/${assetId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    await parseJsonResponse<Asset>(response, 'Errore asset.');
    await invalidateDashboardOverviewSummary(asset.userId, 'investment_asset_quantity_updated');
  } catch (error) {
    console.error('Failed to update investment asset quantity', {
      assetId,
      operation: 'updateInvestmentAssetQuantity',
      signedQuantityDelta,
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to update investment asset quantity for ${assetId}`, { cause: error });
  }
}

/**
 * Delete an asset and its future dividends
 * Only deletes dividends with ex-date > today to preserve historical data
 */
export async function deleteAsset(assetId: string, userId: string): Promise<void> {
  try {
    const response = await authenticatedFetch(`/api/assets/${assetId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch (error) {
      console.error('Failed to parse delete asset response body', {
        userId,
        assetId,
        operation: 'deleteAsset',
        status: response.status,
        error: getErrorMessage(error),
      });
      throw new Error(`Failed to parse delete asset response for ${assetId}`, { cause: error });
    }

    if (!response.ok) {
      const apiError =
        typeof responseBody === 'object' &&
        responseBody !== null &&
        'error' in responseBody &&
        typeof responseBody.error === 'string'
          ? responseBody.error
          : 'Failed to delete asset';

      throw new Error(apiError);
    }

    const deletedFutureDividends =
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'deletedFutureDividends' in responseBody &&
      typeof responseBody.deletedFutureDividends === 'number'
        ? responseBody.deletedFutureDividends
        : null;

    console.log('Asset deleted successfully', {
      userId,
      assetId,
      deletedFutureDividends,
    });
  } catch (error) {
    console.error('Failed to delete asset', {
      userId,
      assetId,
      operation: 'deleteAsset',
      error: getErrorMessage(error),
    });
    throw new Error(`Failed to delete asset ${assetId}`, { cause: error });
  }
}

export function calculateAssetValue(asset: Asset): number {
  // For non-EUR assets, prefer the pre-converted EUR price stored during price updates.
  // This avoids async FX calls at read time while keeping portfolio totals in EUR.
  // Falls back to currentPrice for EUR assets and pre-migration documents that
  // were not yet updated after this change was deployed.
  //
  // GBp safety guard: Yahoo Finance returns LSE prices in pence (GBp), not pounds.
  // priceUpdater.ts normalises GBp→GBP (÷100) before writing to Firestore, but
  // legacy assets or assets whose price was never refreshed may still carry the
  // raw pence value with currency='GBp'. Dividing by 100 here keeps the fallback
  // path safe even for those documents.
  const isGBpFallback = asset.currency === 'GBp'; // lowercase 'p' = pence
  const normalizedFallbackPrice = isGBpFallback
    ? asset.currentPrice / 100
    : asset.currentPrice;

  const priceInEur =
    asset.currency &&
    asset.currency.toUpperCase() !== 'EUR' &&
    asset.currentPriceEur !== undefined
      ? asset.currentPriceEur
      : normalizedFallbackPrice;

  const baseValue = asset.quantity * priceInEur;

  // For real estate with outstanding debt, subtract the debt to get net equity.
  // Use Math.max(0, ...) to prevent negative values for underwater mortgages
  // (where debt > property value). Negative net worth is tracked at portfolio level.
  if (asset.assetClass === 'realestate' && asset.outstandingDebt) {
    return Math.max(0, baseValue - asset.outstandingDebt);
  }

  return baseValue;
}

/**
 * Calculate total portfolio value from assets
 */
export function calculateTotalValue(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate liquid net worth (assets that can be quickly converted to cash)
 *
 * Liquidity determination:
 * - If isLiquid field is explicitly defined, use that value (allows user override)
 * - Otherwise use legacy logic: exclude real estate and private equity (for backwards compatibility)
 *
 * The isLiquid override takes precedence because users may have unique situations
 * (e.g., illiquid bonds, liquid real estate like REITs).
 *
 * @param assets - All user assets
 * @returns Total value of liquid assets
 */
export function calculateLiquidNetWorth(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // If isLiquid is explicitly defined, use that value (user override)
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === true;
      }
      // Otherwise use legacy logic for backwards compatibility
      // (assets created before isLiquid field was added)
      return (
        asset.assetClass !== 'realestate' &&
        asset.type !== 'pensionfund' &&
        asset.subCategory !== 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate illiquid net worth (assets that cannot be quickly converted to cash)
 *
 * See calculateLiquidNetWorth() for liquidity determination logic.
 *
 * @param assets - All user assets
 * @returns Total value of illiquid assets
 */
export function calculateIlliquidNetWorth(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // If isLiquid is explicitly defined, use that value (user override)
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === false;
      }
      // Otherwise use legacy logic for backwards compatibility
      return (
        asset.assetClass === 'realestate' ||
        asset.type === 'pensionfund' ||
        asset.subCategory === 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate FIRE-eligible net worth (conditionally excludes primary residences)
 *
 * FIRE calculations MAY exclude primary residences because:
 * - You need somewhere to live (not available for withdrawal)
 * - Selling your primary home doesn't contribute to retirement income
 * - Aligns with standard FIRE methodology (only count assets that generate income/can be liquidated)
 *
 * However, some users prefer to include primary residence equity in their FIRE number,
 * especially if they plan to downsize or relocate in retirement.
 *
 * Includes ALL other assets:
 * - Liquid assets (stocks, bonds, cash)
 * - Illiquid assets (except optionally primary residence real estate)
 * - Investment properties (rental income = FIRE-eligible)
 *
 * @param assets - All user assets
 * @param includePrimaryResidence - If true, include primary residences; if false, exclude them (default: false)
 * @returns Total value of FIRE-eligible assets
 */
export function calculateFIRENetWorth(assets: Asset[], includePrimaryResidence: boolean = false): number {
  return assets
    .filter(asset => {
      // Exclude real estate marked as primary residence (if user setting is disabled)
      if (!includePrimaryResidence && asset.assetClass === 'realestate' && asset.isPrimaryResidence === true) {
        return false;
      }
      return true;
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate liquid FIRE-eligible net worth.
 *
 * Combines the liquidity filter (same logic as calculateLiquidNetWorth) with
 * the primary-residence exclusion (same logic as calculateFIRENetWorth).
 *
 * Invariant: calculateLiquidFIRENetWorth + calculateIlliquidFIRENetWorth === calculateFIRENetWorth
 * for any given (assets, includePrimaryResidence) pair.
 */
export function calculateLiquidFIRENetWorth(assets: Asset[], includePrimaryResidence: boolean = false): number {
  return assets
    .filter(asset => {
      if (!includePrimaryResidence && asset.assetClass === 'realestate' && asset.isPrimaryResidence === true) {
        return false;
      }
      if (asset.isLiquid !== undefined) return asset.isLiquid === true;
      return asset.assetClass !== 'realestate' && asset.type !== 'pensionfund' && asset.subCategory !== 'Private Equity';
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate illiquid FIRE-eligible net worth.
 *
 * Combines the illiquidity filter (same logic as calculateIlliquidNetWorth) with
 * the primary-residence exclusion (same logic as calculateFIRENetWorth).
 *
 * Invariant: calculateLiquidFIRENetWorth + calculateIlliquidFIRENetWorth === calculateFIRENetWorth
 * for any given (assets, includePrimaryResidence) pair.
 */
export function calculateIlliquidFIRENetWorth(assets: Asset[], includePrimaryResidence: boolean = false): number {
  return assets
    .filter(asset => {
      if (!includePrimaryResidence && asset.assetClass === 'realestate' && asset.isPrimaryResidence === true) {
        return false;
      }
      if (asset.isLiquid !== undefined) return asset.isLiquid === false;
      return asset.assetClass === 'realestate' || asset.type === 'pensionfund' || asset.subCategory === 'Private Equity';
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate unrealized gains for a single asset
 *
 * Returns 0 if averageCost is not set because gains cannot be calculated
 * without a cost basis (we don't know the purchase price).
 *
 * @param asset - Asset to calculate gains for
 * @returns Unrealized gain/loss (current value - cost basis)
 */
export function calculateUnrealizedGains(asset: Asset): number {
  // Cannot calculate gains without cost basis - return 0 as neutral value
  if (!asset.averageCost || asset.averageCost <= 0) {
    return 0;
  }

  // Use calculateAssetValue() for the current side so the price is always
  // EUR-normalised (via currentPriceEur when available, or the GBp-safe fallback).
  // averageCost is stored in the asset's native currency as entered by the user,
  // so gains for non-EUR assets are expressed in the native currency — a known
  // display-only limitation that is acceptable and consistent with AssetCard.
  const currentValue = calculateAssetValue(asset);
  const costBasis = asset.quantity * asset.averageCost;
  return currentValue - costBasis;
}

/**
 * Calculate estimated taxes on unrealized gains for a single asset
 * Returns 0 if taxRate is not set or gains are negative/zero
 */
export function calculateEstimatedTaxes(asset: Asset): number {
  const gains = calculateUnrealizedGains(asset);

  if (gains <= 0 || !asset.taxRate || asset.taxRate <= 0) {
    return 0;
  }

  return gains * (asset.taxRate / 100);
}

/**
 * Calculate total unrealized gains for portfolio
 */
export function calculateTotalUnrealizedGains(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + calculateUnrealizedGains(asset), 0);
}

/**
 * Calculate total estimated taxes for portfolio
 */
export function calculateTotalEstimatedTaxes(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + calculateEstimatedTaxes(asset), 0);
}

/**
 * Calculate estimated taxes only for liquid assets
 * Used to calculate net liquid net worth
 */
export function calculateLiquidEstimatedTaxes(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // Use same logic as calculateLiquidNetWorth
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === true;
      }
      // Legacy logic for backwards compatibility
      return (
        asset.assetClass !== 'realestate' &&
        asset.subCategory !== 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateEstimatedTaxes(asset), 0);
}

/**
 * Calculate gross total (current portfolio value)
 * Alias for calculateTotalValue for clarity in cost basis context
 */
export function calculateGrossTotal(assets: Asset[]): number {
  return calculateTotalValue(assets);
}

/**
 * Calculate net total (portfolio value after estimated taxes on unrealized gains)
 */
export function calculateNetTotal(assets: Asset[]): number {
  const grossTotal = calculateTotalValue(assets);
  const estimatedTaxes = calculateTotalEstimatedTaxes(assets);
  return grossTotal - estimatedTaxes;
}

/**
 * Calculate portfolio weighted average TER (Total Expense Ratio)
 * Formula: TER_portfolio = (TER_asset1 × Value_asset1 + TER_asset2 × Value_asset2 + ...) / Total_portfolio_value
 * Only includes assets that have a TER value
 * Returns 0 if no assets have TER
 */
export function calculatePortfolioWeightedTER(assets: Asset[]): number {
  // Filter assets that have TER defined
  const assetsWithTER = assets.filter(
    asset => asset.totalExpenseRatio !== undefined && asset.totalExpenseRatio > 0
  );

  if (assetsWithTER.length === 0) {
    return 0;
  }

  // Calculate weighted sum of TER
  const weightedTERSum = assetsWithTER.reduce((sum, asset) => {
    const assetValue = calculateAssetValue(asset);
    const ter = asset.totalExpenseRatio || 0;
    return sum + (ter * assetValue);
  }, 0);

  // Calculate total value of assets with TER
  const totalValueWithTER = assetsWithTER.reduce(
    (sum, asset) => sum + calculateAssetValue(asset),
    0
  );

  if (totalValueWithTER === 0) {
    return 0;
  }

  return weightedTERSum / totalValueWithTER;
}

/**
 * Calculate annual portfolio cost based on TER
 * Formula: Annual_cost = Total_portfolio_value × (TER_portfolio / 100)
 * Returns 0 if no assets have TER
 */
export function calculateAnnualPortfolioCost(assets: Asset[]): number {
  const portfolioTER = calculatePortfolioWeightedTER(assets);

  if (portfolioTER === 0) {
    return 0;
  }

  // Calculate total value of assets with TER
  const assetsWithTER = assets.filter(
    asset => asset.totalExpenseRatio !== undefined && asset.totalExpenseRatio > 0
  );

  const totalValueWithTER = assetsWithTER.reduce(
    (sum, asset) => sum + calculateAssetValue(asset),
    0
  );

  return totalValueWithTER * (portfolioTER / 100);
}

/**
 * Calculate annual stamp duty (imposta di bollo) on the portfolio.
 * Excluded: sold assets (quantity=0) and assets with stampDutyExempt=true.
 * For checking accounts (cash with the specified subCategory): applies only if value strictly > 5000€.
 */
export function calculateStampDuty(
  assets: Asset[],
  stampDutyRate: number,
  checkingAccountSubCategory?: string
): number {
  return assets
    .filter(a => a.quantity > 0)
    .filter(a => !a.stampDutyExempt)
    .reduce((total, asset) => {
      const value = calculateAssetValue(asset);
      // Conti correnti: apply stamp duty only if value strictly > 5000€
      if (
        asset.assetClass === 'cash' &&
        checkingAccountSubCategory &&
        asset.subCategory === checkingAccountSubCategory
      ) {
        return value > 5000 ? total + value * (stampDutyRate / 100) : total;
      }
      return total + value * (stampDutyRate / 100);
    }, 0);
}

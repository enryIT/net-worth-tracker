import type { MonthlySnapshot } from '@/types/assets';
import type { ExpenseType } from '@/types/expenses';

interface DummySnapshotParams {
  userId: string;
  initialNetWorth: number;
  monthlyGrowthRate: number; // Percentage (e.g., 3 for 3%)
  numberOfMonths: number;
  averageMonthlyIncome?: number; // Optional: average monthly income
  averageMonthlyExpenses?: number; // Optional: average monthly expenses
}

interface DummyAsset {
  ticker: string;
  name: string;
  assetClass: string;
}

interface DummyCategoryRecord {
  id: string;
  name: string;
  type: ExpenseType;
}

type SnapshotWritePayload = {
  year: number;
  month: number;
  isDummy: boolean;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  byAssetClass: MonthlySnapshot['byAssetClass'];
  byAsset: MonthlySnapshot['byAsset'];
  assetAllocation: MonthlySnapshot['assetAllocation'];
};

const SNAPSHOTS_API_PATH = '/api/snapshots';
const EXPENSE_CATEGORIES_API_PATH = '/api/expense-categories';
const EXPENSES_API_PATH = '/api/expenses';
const SNAPSHOT_GENERATION_ERROR = 'Errore durante la creazione degli snapshot fittizi.';

// Dummy assets to use in snapshots
const DUMMY_ASSETS: DummyAsset[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', assetClass: 'equity' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', assetClass: 'equity' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', assetClass: 'equity' },
  { ticker: 'TSLA', name: 'Tesla Inc.', assetClass: 'equity' },
  { ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto' },
  { ticker: 'ETH', name: 'Ethereum', assetClass: 'crypto' },
  { ticker: 'US10Y', name: 'US Treasury 10Y', assetClass: 'bonds' },
  { ticker: 'CORP', name: 'Corporate Bonds', assetClass: 'bonds' },
  { ticker: 'PROPERTY', name: 'Real Estate Fund', assetClass: 'realestate' },
  { ticker: 'CASH', name: 'Cash EUR', assetClass: 'cash' },
];

/**
 * Generates a random variation around the target growth rate to simulate market volatility
 * Uses Box-Muller transform to approximate normal distribution
 */
function getRandomGrowthRate(targetRate: number, volatility: number): number {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  // Add random variation with specified volatility
  return targetRate + (z0 * volatility);
}

/**
 * Generates dummy monthly snapshots for testing purposes
 */
export async function generateDummySnapshots(params: DummySnapshotParams): Promise<void> {
  const {
    userId,
    initialNetWorth,
    monthlyGrowthRate,
    numberOfMonths,
    averageMonthlyIncome,
    averageMonthlyExpenses,
  } = params;

  const snapshots: SnapshotWritePayload[] = [];
  const currentDate = new Date();

  // Create dummy categories for expenses if income/expenses generation is enabled
  let categoriesByType: Map<ExpenseType, DummyCategoryRecord[]> | undefined;
  if (averageMonthlyIncome !== undefined && averageMonthlyExpenses !== undefined) {
    categoriesByType = await createDummyCategories(userId);
  }

  // Asset allocation percentages (constant throughout simulation)
  const EQUITY_ALLOCATION = 0.60; // 60%
  const BONDS_ALLOCATION = 0.25; // 25%
  const CRYPTO_ALLOCATION = 0.08; // 8%
  const REALESTATE_ALLOCATION = 0.05; // 5%
  const CASH_ALLOCATION = 0.02; // 2%

  // Calculate initial values for each asset class
  let equityValue = initialNetWorth * EQUITY_ALLOCATION;
  let bondsValue = initialNetWorth * BONDS_ALLOCATION;
  let cryptoValue = initialNetWorth * CRYPTO_ALLOCATION;
  let realEstateValue = initialNetWorth * REALESTATE_ALLOCATION;
  let cashValue = initialNetWorth * CASH_ALLOCATION;

  // Track asset class values separately for realistic behavior
  const equityHistory: number[] = [equityValue];
  const bondsHistory: number[] = [bondsValue];
  const cryptoHistory: number[] = [cryptoValue];
  const realEstateHistory: number[] = [realEstateValue];
  const cashHistory: number[] = [cashValue];
  const netWorthHistory: number[] = [initialNetWorth];

  // Pre-calculate each asset class growth with different rates and volatility
  // Target rates are derived from user's input to maintain portfolio average
  // Equity: higher return, higher volatility
  // Bonds: lower return, lower volatility
  for (let i = 1; i < numberOfMonths; i++) {
    // Equity: ~1.25x user's target rate, volatility ~1.4% monthly (~5% annual)
    const equityRate = getRandomGrowthRate(monthlyGrowthRate * 1.25, 1.4);
    equityValue = equityValue * (1 + equityRate / 100);
    equityHistory.push(equityValue);

    // Bonds: ~0.5x user's target rate, volatility ~0.4% monthly (~1.4% annual)
    const bondsRate = getRandomGrowthRate(monthlyGrowthRate * 0.5, 0.4);
    bondsValue = bondsValue * (1 + bondsRate / 100);
    bondsHistory.push(bondsValue);

    // Crypto: ~1.5x user's target rate, high volatility ~3% monthly (~10% annual)
    const cryptoRate = getRandomGrowthRate(monthlyGrowthRate * 1.5, 3.0);
    cryptoValue = cryptoValue * (1 + cryptoRate / 100);
    cryptoHistory.push(cryptoValue);

    // Real Estate: ~0.7x user's target rate, low volatility ~0.3% monthly
    const realEstateRate = getRandomGrowthRate(monthlyGrowthRate * 0.7, 0.3);
    realEstateValue = realEstateValue * (1 + realEstateRate / 100);
    realEstateHistory.push(realEstateValue);

    // Cash: minimal growth (inflation only), very low volatility
    const cashRate = getRandomGrowthRate(0.2, 0.05); // ~2.4% annual
    cashValue = cashValue * (1 + cashRate / 100);
    cashHistory.push(cashValue);

    // Total net worth is sum of all asset classes
    const totalNetWorth = equityValue + bondsValue + cryptoValue + realEstateValue + cashValue;
    netWorthHistory.push(totalNetWorth);
  }

  // Generate snapshots for the last N months
  for (let i = numberOfMonths - 1; i >= 0; i--) {
    const snapshotDate = new Date(currentDate);
    snapshotDate.setMonth(snapshotDate.getMonth() - i);

    const year = snapshotDate.getFullYear();
    const month = snapshotDate.getMonth() + 1; // 1-12

    // Get values for this month from pre-calculated histories
    const monthsFromStart = numberOfMonths - i - 1;
    const totalNetWorth = netWorthHistory[monthsFromStart];
    const equity = equityHistory[monthsFromStart];
    const bonds = bondsHistory[monthsFromStart];
    const crypto = cryptoHistory[monthsFromStart];
    const realestate = realEstateHistory[monthsFromStart];
    const cash = cashHistory[monthsFromStart];

    const snapshotPayload = buildSnapshotPayload({
      year,
      month,
      totalNetWorth,
      equity,
      bonds,
      crypto,
      realestate,
      cash,
    });

    snapshots.push(snapshotPayload);

    // Generate expenses and income for this month if enabled
    if (categoriesByType && averageMonthlyIncome !== undefined && averageMonthlyExpenses !== undefined) {
      await generateMonthlyExpenses(
        userId,
        year,
        month,
        categoriesByType,
        averageMonthlyIncome,
        averageMonthlyExpenses
      );
    }
  }

  for (const snapshot of snapshots) {
    await postLocalJson(SNAPSHOTS_API_PATH, snapshot);
  }
}

// Standard dummy categories for expense generation
const DUMMY_CATEGORIES: Array<{ name: string; type: ExpenseType; color: string }> = [
  // Income categories
  { name: 'Stipendio', type: 'income', color: '#10b981' },
  { name: 'Freelance', type: 'income', color: '#059669' },
  { name: 'Investimenti', type: 'income', color: '#047857' },
  { name: 'Altro (Entrate)', type: 'income', color: '#065f46' },

  // Fixed expenses
  { name: 'Affitto', type: 'fixed', color: '#ef4444' },
  { name: 'Utenze', type: 'fixed', color: '#dc2626' },
  { name: 'Abbonamenti', type: 'fixed', color: '#b91c1c' },

  // Variable expenses
  { name: 'Spesa', type: 'variable', color: '#f59e0b' },
  { name: 'Trasporti', type: 'variable', color: '#d97706' },
  { name: 'Svago', type: 'variable', color: '#b45309' },
  { name: 'Shopping', type: 'variable', color: '#92400e' },

  // Debts
  { name: 'Mutuo', type: 'debt', color: '#8b5cf6' },
  { name: 'Prestito Auto', type: 'debt', color: '#7c3aed' },
];

/**
 * Creates dummy expense categories if they don't exist
 */
async function createDummyCategories(userId: string): Promise<Map<ExpenseType, DummyCategoryRecord[]>> {
  const categoriesByType = new Map<ExpenseType, DummyCategoryRecord[]>();

  for (const categoryDef of DUMMY_CATEGORIES) {
    const legacyCategoryId = `dummy-category-${categoryDef.type}-${slugifyCategoryName(categoryDef.name)}`;

    const category = await postLocalJson<DummyCategoryRecord>(EXPENSE_CATEGORIES_API_PATH, {
      name: categoryDef.name,
      type: categoryDef.type,
      color: categoryDef.color,
      subCategories: [],
      legacyFirebaseId: legacyCategoryId,
    });

    if (!categoriesByType.has(categoryDef.type)) {
      categoriesByType.set(categoryDef.type, []);
    }
    categoriesByType.get(categoryDef.type)!.push(category);
  }

  return categoriesByType;
}

/**
 * Generates random amount with realistic variation
 */
function generateRandomAmount(baseAmount: number, variationPercent: number): number {
  const variation = ((Math.random() - 0.5) * 2 * variationPercent) / 100;
  return Math.round(baseAmount * (1 + variation) * 100) / 100;
}

/**
 * Generates dummy expenses and income for a given month
 */
async function generateMonthlyExpenses(
  userId: string,
  year: number,
  month: number,
  categoriesByType: Map<ExpenseType, DummyCategoryRecord[]>,
  averageMonthlyIncome: number,
  averageMonthlyExpenses: number
): Promise<void> {
  const expenses: Array<{
    type: ExpenseType;
    categoryId: string;
    categoryName: string;
    amount: number;
    currency: string;
    date: string;
    notes: string;
    isRecurring?: boolean;
    recurringDay?: number;
    legacyFirebaseId: string;
  }> = [];

  // Generate income entries (1-3 per month)
  const incomeCategories = categoriesByType.get('income') || [];
  const numIncomeEntries = Math.floor(Math.random() * 2) + 1; // 1-2 entries
  const incomePerEntry = averageMonthlyIncome / numIncomeEntries;

  for (let i = 0; i < numIncomeEntries && i < incomeCategories.length; i++) {
    const category = incomeCategories[i];
    const amount = generateRandomAmount(incomePerEntry, 8); // +/-8% variation
    const dayOfMonth = Math.floor(Math.random() * 28) + 1;

    expenses.push({
      type: 'income',
      categoryId: category.id,
      categoryName: category.name,
      amount: Math.abs(amount), // Income is positive
      currency: 'EUR',
      date: new Date(year, month - 1, dayOfMonth).toISOString(),
      notes: 'Entrata fittizia generata automaticamente',
      legacyFirebaseId: `dummy-income-${userId}-${year}-${month}-${i}`,
    });
  }

  // Calculate expense distribution
  const fixedExpenses = averageMonthlyExpenses * 0.35; // 35% fixed
  const variableExpenses = averageMonthlyExpenses * 0.5; // 50% variable
  const debtExpenses = averageMonthlyExpenses * 0.15; // 15% debt

  // Generate fixed expenses (constant with minimal variation)
  const fixedCategories = categoriesByType.get('fixed') || [];
  const fixedPerCategory = fixedExpenses / fixedCategories.length;

  for (let i = 0; i < fixedCategories.length; i++) {
    const category = fixedCategories[i];
    const amount = generateRandomAmount(fixedPerCategory, 3); // +/-3% variation
    const dayOfMonth = ((i * 7 + 5) % 28) + 1; // Spread throughout month

    expenses.push({
      type: 'fixed',
      categoryId: category.id,
      categoryName: category.name,
      amount: -Math.abs(amount), // Expenses are negative
      currency: 'EUR',
      date: new Date(year, month - 1, dayOfMonth).toISOString(),
      notes: 'Spesa fissa fittizia',
      legacyFirebaseId: `dummy-fixed-${userId}-${year}-${month}-${i}`,
    });
  }

  // Generate variable expenses (high variation, multiple entries)
  const variableCategories = categoriesByType.get('variable') || [];
  const numVariableEntries = Math.floor(Math.random() * 8) + 8; // 8-15 entries per month
  const variablePerEntry = variableExpenses / numVariableEntries;

  for (let i = 0; i < numVariableEntries; i++) {
    const category = variableCategories[Math.floor(Math.random() * variableCategories.length)];
    const amount = generateRandomAmount(variablePerEntry, 40); // +/-40% variation
    const dayOfMonth = Math.floor(Math.random() * 28) + 1;

    expenses.push({
      type: 'variable',
      categoryId: category.id,
      categoryName: category.name,
      amount: -Math.abs(amount), // Expenses are negative
      currency: 'EUR',
      date: new Date(year, month - 1, dayOfMonth).toISOString(),
      notes: 'Spesa variabile fittizia',
      legacyFirebaseId: `dummy-variable-${userId}-${year}-${month}-${i}`,
    });
  }

  // Generate debt expenses (constant)
  const debtCategories = categoriesByType.get('debt') || [];
  const debtPerCategory = debtExpenses / Math.max(debtCategories.length, 1);

  for (let i = 0; i < debtCategories.length; i++) {
    const category = debtCategories[i];
    const amount = generateRandomAmount(debtPerCategory, 1); // +/-1% variation (almost constant)
    const dayOfMonth = i === 0 ? 1 : 15; // 1st or 15th of month

    expenses.push({
      type: 'debt',
      categoryId: category.id,
      categoryName: category.name,
      amount: -Math.abs(amount), // Expenses are negative
      currency: 'EUR',
      date: new Date(year, month - 1, dayOfMonth).toISOString(),
      notes: 'Debito fittizio',
      isRecurring: true,
      recurringDay: dayOfMonth,
      legacyFirebaseId: `dummy-debt-${userId}-${year}-${month}-${i}`,
    });
  }

  for (const expense of expenses) {
    await postLocalJson(EXPENSES_API_PATH, expense);
  }
}

function buildSnapshotPayload(input: {
  year: number;
  month: number;
  totalNetWorth: number;
  equity: number;
  bonds: number;
  crypto: number;
  realestate: number;
  cash: number;
}): SnapshotWritePayload {
  const {
    year,
    month,
    totalNetWorth,
    equity,
    bonds,
    crypto,
    realestate,
    cash,
  } = input;

  // Real estate is illiquid, others are liquid
  const liquidNetWorth = equity + bonds + crypto + cash;
  const illiquidNetWorth = realestate;

  // Use pre-calculated values for each asset class
  const byAssetClass = {
    equity,
    bonds,
    crypto,
    realestate,
    cash,
    commodity: 0, // No commodity allocation in dummy data
  };

  // Calculate allocation percentages based on actual values (will vary over time)
  const assetAllocation = {
    equity: totalNetWorth > 0 ? (equity / totalNetWorth) * 100 : 0,
    bonds: totalNetWorth > 0 ? (bonds / totalNetWorth) * 100 : 0,
    crypto: totalNetWorth > 0 ? (crypto / totalNetWorth) * 100 : 0,
    realestate: totalNetWorth > 0 ? (realestate / totalNetWorth) * 100 : 0,
    cash: totalNetWorth > 0 ? (cash / totalNetWorth) * 100 : 0,
    commodity: 0,
  };

  // Generate individual asset snapshots
  const byAsset = DUMMY_ASSETS.map((asset, index) => {
    const assetClassValue = byAssetClass[asset.assetClass as keyof typeof byAssetClass];
    const numAssetsInClass = DUMMY_ASSETS.filter(a => a.assetClass === asset.assetClass).length;

    // Distribute asset class value among assets in that class
    const totalValue = assetClassValue / numAssetsInClass;

    // Generate random but realistic price
    let price: number;
    if (asset.assetClass === 'crypto') {
      price = Math.random() * 50000 + 10000; // Crypto: 10k-60k
    } else if (asset.assetClass === 'equity') {
      price = Math.random() * 200 + 50; // Stocks: 50-250
    } else if (asset.assetClass === 'realestate') {
      price = Math.random() * 100000 + 50000; // Real estate: 50k-150k
    } else {
      price = Math.random() * 100 + 50; // Others: 50-150
    }

    const quantity = totalValue / price;

    return {
      assetId: `dummy-asset-${index + 1}`,
      ticker: asset.ticker,
      name: asset.name,
      quantity: Math.round(quantity * 100) / 100, // Round to 2 decimals
      price: Math.round(price * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
    };
  });

  return {
    year,
    month,
    isDummy: true,
    totalNetWorth: Math.round(totalNetWorth * 100) / 100,
    liquidNetWorth: Math.round(liquidNetWorth * 100) / 100,
    illiquidNetWorth: Math.round(illiquidNetWorth * 100) / 100,
    byAssetClass,
    byAsset,
    assetAllocation,
  };
}

function slugifyCategoryName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-');
}

async function postLocalJson<TResponse = unknown>(
  url: string,
  body: unknown
): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return parseJsonResponse<TResponse>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string'
        ? payload.error
        : SNAPSHOT_GENERATION_ERROR
    );
  }

  return payload as T;
}

/**
 * Generates a single dummy snapshot for a specific month
 */
export async function generateSingleDummySnapshot(
  _userId: string,
  year: number,
  month: number,
  netWorth: number
): Promise<void> {
  const snapshot = buildSnapshotPayload({
    year,
    month,
    totalNetWorth: netWorth,
    equity: netWorth * 0.6,
    bonds: netWorth * 0.25,
    crypto: netWorth * 0.08,
    realestate: netWorth * 0.05,
    cash: netWorth * 0.02,
  });

  await postLocalJson(SNAPSHOTS_API_PATH, snapshot);
}

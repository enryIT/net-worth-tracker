import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CashflowWidget } from './cashflow-kpi/CashflowWidget';
import { CompactExpenseRow } from './CompactExpenseRow';
import { MobileFiltersDrawer } from './MobileFiltersDrawer';
import type { CategoryBreakdownItem } from './CategoryBreakdownList';
import type { ExpenseCategory, Expense } from '@/types/expenses';
import type { MultiSelectGroup } from '@/components/ui/multi-select';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const now = new Date();

const CATEGORIES: ExpenseCategory[] = [
  {
    id: 'cat-1',
    userId: 'u1',
    name: 'Alimentari',
    type: 'variable',
    color: '#ef4444',
    icon: 'ShoppingCart',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-2',
    userId: 'u1',
    name: 'Trasporti',
    type: 'variable',
    color: '#3b82f6',
    icon: 'Car',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-3',
    userId: 'u1',
    name: 'Abbonamenti',
    type: 'fixed',
    color: '#8b5cf6',
    icon: 'Tv',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-4',
    userId: 'u1',
    name: 'Ristoranti',
    type: 'variable',
    color: '#f59e0b',
    icon: 'UtensilsCrossed',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-5',
    userId: 'u1',
    name: 'Salute',
    type: 'variable',
    color: '#10b981',
    icon: 'HeartPulse',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'inc-1',
    userId: 'u1',
    name: 'Stipendio',
    type: 'income',
    color: '#22c55e',
    icon: 'Banknote',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'inc-2',
    userId: 'u1',
    name: 'Freelance',
    type: 'income',
    color: '#06b6d4',
    icon: 'Laptop',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
];

const EXPENSE_CATS: CategoryBreakdownItem[] = [
  { category: 'Alimentari', amount: 450, percentage: 35 },
  { category: 'Trasporti', amount: 300, percentage: 23 },
  { category: 'Abbonamenti', amount: 250, percentage: 19 },
  { category: 'Ristoranti', amount: 180, percentage: 14 },
  { category: 'Salute', amount: 120, percentage: 9 },
];

const INCOME_CATS: CategoryBreakdownItem[] = [
  { category: 'Stipendio', amount: 2800, percentage: 78 },
  { category: 'Freelance', amount: 800, percentage: 22 },
];

const CATEGORY_FILTER_OPTIONS: MultiSelectGroup[] = [
  { heading: 'Spese Fisse', options: [{ value: 'cat-3', label: 'Abbonamenti' }] },
  {
    heading: 'Spese Variabili',
    options: [
      { value: 'cat-1', label: 'Alimentari' },
      { value: 'cat-2', label: 'Trasporti' },
      { value: 'cat-4', label: 'Ristoranti' },
      { value: 'cat-5', label: 'Salute' },
    ],
  },
  {
    heading: 'Entrate',
    options: [
      { value: 'inc-1', label: 'Stipendio' },
      { value: 'inc-2', label: 'Freelance' },
    ],
  },
];

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Data (recenti)', shortLabel: 'Recenti' },
  { value: 'date-asc', label: 'Data (meno recenti)', shortLabel: 'Meno rec.' },
  { value: 'amount-desc', label: 'Importo (alto)', shortLabel: '€ Alto' },
  { value: 'amount-asc', label: 'Importo (basso)', shortLabel: '€ Basso' },
];

function makeExpense(overrides: Partial<Expense> & { id: string }): Expense {
  return {
    userId: 'u1',
    type: 'variable',
    categoryId: 'cat-1',
    categoryName: 'Alimentari',
    amount: -50,
    currency: 'EUR',
    date: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const SAMPLE_EXPENSES: Array<{ expense: Expense; icon?: string; color?: string }> = [
  {
    expense: makeExpense({ id: 'e1', notes: 'Spesa settimanale Esselunga', amount: -85.5 }),
    icon: 'ShoppingCart',
    color: '#ef4444',
  },
  {
    expense: makeExpense({
      id: 'e2',
      type: 'income',
      categoryId: 'inc-1',
      categoryName: 'Stipendio',
      notes: 'Stipendio maggio',
      amount: 2800,
    }),
    icon: 'Banknote',
    color: '#22c55e',
  },
  {
    expense: makeExpense({
      id: 'e3',
      type: 'fixed',
      categoryId: 'cat-3',
      categoryName: 'Netflix',
      notes: undefined,
      amount: -15.99,
    }),
    icon: 'Tv',
    color: '#8b5cf6',
  },
  {
    expense: makeExpense({
      id: 'e4',
      categoryId: 'cat-2',
      categoryName: 'Trasporti',
      notes: 'Benzina',
      amount: -65,
    }),
    icon: 'Car',
    color: '#3b82f6',
  },
  {
    expense: makeExpense({
      id: 'e5',
      categoryId: 'cat-4',
      categoryName: 'Ristoranti',
      notes: 'Pranzo di lavoro',
      amount: -22.5,
    }),
    icon: 'UtensilsCrossed',
    color: '#f59e0b',
  },
  {
    expense: makeExpense({
      id: 'e6',
      notes: 'iPhone 16 Pro',
      amount: -83.25,
      isInstallment: true,
      installmentNumber: 3,
      installmentTotal: 12,
    }),
    icon: 'Smartphone',
    color: '#3b82f6',
  },
  {
    expense: makeExpense({
      id: 'e7',
      type: 'fixed',
      categoryId: 'cat-3',
      categoryName: 'Palestra',
      notes: 'Abbonamento mensile',
      amount: -39.9,
      isRecurring: true,
    }),
    icon: 'Dumbbell',
    color: '#14b8a6',
  },
  {
    expense: makeExpense({
      id: 'e8',
      type: 'transfer',
      categoryName: 'Trasferimento',
      notes: 'Verso conto deposito',
      amount: 500,
    }),
    icon: 'ArrowRightLeft',
    color: '#6b7280',
  },
];

// ─── Page template component ──────────────────────────────────────────────────

interface CashflowPageProps {
  /** Scenario label shown for identification. */
  scenario: string;
  income: number;
  expenses: number;
  net: number;
  ratio: number | null;
  incomeDelta?: number | null;
  expensesDelta?: number | null;
  savingsRate: number;
  expenseCategories: CategoryBreakdownItem[];
  incomeCategories: CategoryBreakdownItem[];
  showFilters: boolean;
  showTransactions: boolean;
  activeFilterCount?: number;
  transfers?: number;
}

function CashflowPageTemplate({
  scenario,
  income,
  expenses,
  net,
  ratio,
  incomeDelta,
  expensesDelta,
  savingsRate,
  expenseCategories,
  incomeCategories,
  showFilters,
  showTransactions,
  activeFilterCount = 0,
  transfers,
}: CashflowPageProps) {
  return (
    <div className="mx-auto max-w-[500px] space-y-4 p-4">
      {/* Scenario label */}
      <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
        {scenario}
      </p>

      {/* Hero card */}
      <CashflowWidget
        monthLabel="MAGGIO 2026"
        income={income}
        expenses={expenses}
        net={net}
        ratio={ratio}
        incomeDelta={incomeDelta}
        expensesDelta={expensesDelta}
        savingsRate={savingsRate}
        expenseCategories={expenseCategories}
        incomeCategories={incomeCategories}
        categories={CATEGORIES}
        transfers={transfers}
      />

      {/* Filter bar */}
      {showFilters && (
        <MobileFiltersDrawer
          period={{ kind: 'month', year: 2026, month: 5 }}
          onPeriodChange={fn()}
          availableYears={[2024, 2025, 2026]}
          searchQuery=""
          onSearchChange={fn()}
          categoryMultiSelectOptions={CATEGORY_FILTER_OPTIONS}
          multiSelectValue={[]}
          onCategoryChange={fn()}
          soloSelectedCategory={null}
          subCategoryOptions={[]}
          selectedSubCategoryId="all"
          onSubCategoryChange={fn()}
          accountOptions={[]}
          selectedAccountId="all"
          onAccountChange={fn()}
          activeFilterCount={activeFilterCount}
          onReset={fn()}
          mobileSortKey="date-desc"
          onSortChange={fn()}
          sortOptions={SORT_OPTIONS}
        />
      )}

      {/* Transaction list */}
      {showTransactions && (
        <div className="divide-border border-border bg-card divide-y overflow-hidden rounded-xl border">
          {SAMPLE_EXPENSES.map(({ expense, icon, color }) => (
            <CompactExpenseRow
              key={expense.id}
              expense={expense}
              onSelect={fn()}
              categoryIcon={icon}
              categoryColor={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  component: CashflowPageTemplate,
  title: 'Pages/CashflowMobile',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CashflowPageTemplate>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Page template stories ────────────────────────────────────────────────────

/** Healthy month — surplus, no transfers. */
export const HealthyMonth: Story = {
  args: {
    scenario: 'Mese sano — surplus',
    income: 3600,
    expenses: 1300,
    net: 2300,
    ratio: 2.77,
    incomeDelta: 5.2,
    expensesDelta: -3.1,
    savingsRate: 63.9,
    expenseCategories: EXPENSE_CATS,
    incomeCategories: INCOME_CATS,
    showFilters: true,
    showTransactions: true,
  },
};

/** Deficit month — expenses exceed income. */
export const DeficitMonth: Story = {
  args: {
    scenario: 'Mese in deficit',
    income: 1200,
    expenses: 1800,
    net: -600,
    ratio: 0.67,
    incomeDelta: -15.2,
    expensesDelta: 22.4,
    savingsRate: -50,
    expenseCategories: EXPENSE_CATS.slice(0, 3),
    incomeCategories: INCOME_CATS.slice(0, 1),
    showFilters: true,
    showTransactions: true,
  },
};

/** First month of tracking — no comparison deltas, empty categories. */
export const FirstMonth: Story = {
  args: {
    scenario: 'Primo mese — nessun dato storico',
    income: 0,
    expenses: 0,
    net: 0,
    ratio: null,
    incomeDelta: null,
    expensesDelta: null,
    savingsRate: 0,
    expenseCategories: [],
    incomeCategories: [],
    showFilters: false,
    showTransactions: false,
  },
};

/** With transfers visible. */
export const WithTransfers: Story = {
  args: {
    scenario: 'Mese con trasferimenti interni',
    income: 3600,
    expenses: 1300,
    net: 2300,
    ratio: 2.77,
    incomeDelta: 2.1,
    expensesDelta: -1.5,
    savingsRate: 63.9,
    expenseCategories: EXPENSE_CATS,
    incomeCategories: INCOME_CATS,
    showFilters: true,
    showTransactions: true,
    transfers: 500,
  },
};

/** Breakeven — income equals expenses. */
export const Breakeven: Story = {
  args: {
    scenario: 'Pareggio perfetto',
    income: 1500,
    expenses: 1500,
    net: 0,
    ratio: 1.0,
    incomeDelta: 0,
    expensesDelta: 0,
    savingsRate: 0,
    expenseCategories: EXPENSE_CATS.slice(0, 2),
    incomeCategories: INCOME_CATS.slice(0, 1),
    showFilters: true,
    showTransactions: true,
  },
};

/** Hero only — no filter bar or transaction list. */
export const HeroOnly: Story = {
  args: {
    scenario: 'Solo hero card',
    income: 3600,
    expenses: 1300,
    net: 2300,
    ratio: 2.77,
    savingsRate: 63.9,
    expenseCategories: EXPENSE_CATS,
    incomeCategories: INCOME_CATS,
    showFilters: false,
    showTransactions: false,
  },
};

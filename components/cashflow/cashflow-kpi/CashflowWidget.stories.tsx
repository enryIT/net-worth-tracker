import type { Meta, StoryObj } from '@storybook/react-vite';
import { CashflowWidget } from './CashflowWidget';
import type { CategoryBreakdownItem } from '@/components/cashflow/CategoryBreakdownList';
import type { ExpenseCategory } from '@/types/expenses';

// ─── Responsive preview helper ────────────────────────────────────────────────

const RESPONSIVE_VIEWPORTS = [
  { label: 'Mobile', width: 390, height: 480 },
  { label: 'Tablet', width: 768, height: 520 },
  { label: 'Desktop', width: 1280, height: 380 },
];

/**
 * Renders three iframes pointing at the TwoCategories story, each sized to a
 * different breakpoint. Because each iframe has its own viewport, Tailwind
 * media queries fire correctly inside each one.
 */
function ResponsivePreview({ storyId }: { storyId: string }) {
  const baseStoryId = storyId.replace(/--[\w-]+$/, '--two-categories');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24, background: 'var(--color-background, #fff)' }}>
      {RESPONSIVE_VIEWPORTS.map(({ label, width, height }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted-foreground, #888)' }}>
            {label} — {width}px
          </span>
          <div style={{ width, border: '1px solid var(--color-border, #e5e7eb)', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
            <iframe
              src={`/iframe.html?id=${baseStoryId}&viewMode=story`}
              width={width}
              height={height}
              style={{ display: 'block', border: 'none' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date();

const MOCK_CATEGORIES: ExpenseCategory[] = [
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
    id: 'cat-6',
    userId: 'u1',
    name: 'Svago',
    type: 'variable',
    color: '#ec4899',
    icon: 'Gamepad2',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-7',
    userId: 'u1',
    name: 'Casa',
    type: 'fixed',
    color: '#14b8a6',
    icon: 'Home',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-8',
    userId: 'u1',
    name: 'Istruzione',
    type: 'variable',
    color: '#6366f1',
    icon: 'GraduationCap',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-9',
    userId: 'u1',
    name: 'Viaggi',
    type: 'variable',
    color: '#0ea5e9',
    icon: 'Plane',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cat-10',
    userId: 'u1',
    name: 'Abbigliamento',
    type: 'variable',
    color: '#d946ef',
    icon: 'Shirt',
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

const TWO_EXPENSE_CATS: CategoryBreakdownItem[] = [
  { category: 'Alimentari', amount: 450, percentage: 60 },
  { category: 'Trasporti', amount: 300, percentage: 40 },
];

const TWO_INCOME_CATS: CategoryBreakdownItem[] = [
  { category: 'Stipendio', amount: 2800, percentage: 85 },
  { category: 'Freelance', amount: 500, percentage: 15 },
];

const MANY_EXPENSE_CATS: CategoryBreakdownItem[] = [
  { category: 'Alimentari', amount: 450, percentage: 22.5 },
  { category: 'Trasporti', amount: 300, percentage: 15 },
  { category: 'Abbonamenti', amount: 250, percentage: 12.5 },
  { category: 'Ristoranti', amount: 220, percentage: 11 },
  { category: 'Salute', amount: 180, percentage: 9 },
  { category: 'Svago', amount: 160, percentage: 8 },
  { category: 'Casa', amount: 150, percentage: 7.5 },
  { category: 'Istruzione', amount: 120, percentage: 6 },
  { category: 'Viaggi', amount: 100, percentage: 5 },
  { category: 'Abbigliamento', amount: 70, percentage: 3.5 },
];

const MANY_INCOME_CATS: CategoryBreakdownItem[] = [
  { category: 'Stipendio', amount: 2800, percentage: 70 },
  { category: 'Freelance', amount: 800, percentage: 20 },
  { category: 'Svago', amount: 400, percentage: 10 },
];

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  component: CashflowWidget,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
**CashflowWidget** is the main KPI block for monthly cashflow monitoring.

Displays income, expenses, net balance, and savings rate for the selected month,
with month-over-month deltas and a per-category breakdown.

**Responsive layout (container-query based):**
- **Narrow container** — 2×2 KPI grid + full-width "Spese per categorie" cell (opens a drawer).
- **Wide container** — single row of 4 KPIs; an inline "Voci per categorie" breakdown shows below.

**Health label** — derived from the income/expenses coverage ratio via \`coverageHealthLabel()\`:
\`Salute ottima\` (≥2×) · \`Salute buona\` (≥1.3×) · \`In pareggio\` (=1×) · \`In deficit\` (<1×).

Used in \`ExpenseTrackingTab\` (cashflow page) and the overview dashboard.
        `.trim(),
      },
    },
  },
  args: {
    monthLabel: 'MAGGIO 2026',
    income: 3300,
    expenses: 750,
    net: 2550,
    ratio: 4.4,
    incomeDelta: 5.2,
    expensesDelta: -3.1,
    savingsRate: 77.3,
    expenseCategories: TWO_EXPENSE_CATS,
    incomeCategories: TWO_INCOME_CATS,
    categories: MOCK_CATEGORIES,
  },
} satisfies Meta<typeof CashflowWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ──────────────────────────────────────────────────────────────────

/** Default — 2 expense categories and 2 income categories, healthy month. */
export const TwoCategories: Story = {};

/** Empty state — no transactions recorded for the month. */
export const EmptyState: Story = {
  args: {
    income: 0,
    expenses: 0,
    net: 0,
    ratio: null,
    incomeDelta: null,
    expensesDelta: null,
    savingsRate: 0,
    expenseCategories: [],
    incomeCategories: [],
  },
};

/** Many categories (10 expenses, 3 income) — stress-tests the category breakdown overflow. */
export const ManyCategories: Story = {
  args: {
    income: 4000,
    expenses: 2000,
    net: 2000,
    ratio: 2.0,
    incomeDelta: 12.3,
    expensesDelta: 8.7,
    savingsRate: 50,
    expenseCategories: MANY_EXPENSE_CATS,
    incomeCategories: MANY_INCOME_CATS,
  },
};

/** Deficit — expenses exceed income. */
export const Deficit: Story = {
  args: {
    income: 1200,
    expenses: 1800,
    net: -600,
    ratio: 0.67,
    incomeDelta: -15.2,
    expensesDelta: 22.4,
    savingsRate: -50,
    expenseCategories: TWO_EXPENSE_CATS,
    incomeCategories: TWO_INCOME_CATS,
  },
};

/** Breakeven — income equals expenses exactly. */
export const Breakeven: Story = {
  args: {
    income: 1500,
    expenses: 1500,
    net: 0,
    ratio: 1.0,
    incomeDelta: 0,
    expensesDelta: 0,
    savingsRate: 0,
    expenseCategories: TWO_EXPENSE_CATS,
    incomeCategories: TWO_INCOME_CATS,
  },
};

/** With internal transfers highlighted. */
export const WithTransfers: Story = {
  args: {
    transfers: 500,
  },
};

/** First month — no MoM comparison data available. */
export const NoDeltaData: Story = {
  args: {
    incomeDelta: null,
    expensesDelta: null,
  },
};

/**
 * Side-by-side preview at all three breakpoints.
 * Each panel is a real iframe so Tailwind media queries fire correctly.
 */
export const Responsive: Story = {
  parameters: {
    layout: 'fullscreen',
    viewport: { disable: true },
    docs: { disable: true },
  },
  render: (_, { id }) => <ResponsivePreview storyId={id} />,
};

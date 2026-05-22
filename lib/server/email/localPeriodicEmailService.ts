import "server-only";

import { Resend } from "resend";
import { MONTH_NAMES } from "@/lib/constants/months";
import { prisma } from "@/lib/server/prisma";
import { getLocalSettings } from "@/lib/server/settings/localSettingsService";
import { getItalyDate, getItalyMonthYear } from "@/lib/utils/dateHelpers";

export type LocalEmailPeriodType = "monthly" | "quarterly" | "yearly";

export type LocalPeriodicEmailResult =
  | { status: "sent" }
  | { status: "disabled"; error: string }
  | { status: "no_recipients"; error: string }
  | { status: "no_snapshot"; error: string };

type PeriodCoordinates = {
  year: number;
  month: number;
};

type LocalPeriodEmailData = {
  periodType: LocalEmailPeriodType;
  year: number;
  month: number;
  currentNetWorth: number;
  previousNetWorth: number;
  netWorthDelta: number;
  netWorthDeltaPct: number;
  liquidNetWorth: number;
  byAssetClass: Record<string, number>;
  byParticipant: Array<{ name: string; amount: number; percent: number }>;
  totalIncome: number;
  totalExpenses: number;
  topExpenseCategories: Array<{ name: string; amount: number }>;
  dividendTotal: number;
  dividendCount: number;
};

export async function sendLocalPeriodicEmail(
  userId: string,
  periodType: LocalEmailPeriodType
): Promise<LocalPeriodicEmailResult> {
  const settings = await getLocalSettings(userId);
  const enabledKey = getEnabledKey(periodType);

  if (!settings?.[enabledKey]) {
    return {
      status: "disabled",
      error: `L'email ${getPeriodLabel(periodType)} non e abilitata per questo account`,
    };
  }

  const recipients = settings.monthlyEmailRecipients ?? [];
  if (recipients.length === 0) {
    return {
      status: "no_recipients",
      error: "Nessun destinatario configurato",
    };
  }

  const { year, month } = resolvePeriodCoordinates(periodType, new Date());
  const emailData = await buildLocalPeriodEmailData(userId, year, month, periodType);
  if (!emailData) {
    return {
      status: "no_snapshot",
      error: "Nessuno snapshot trovato per il periodo richiesto: salva prima uno snapshot",
    };
  }

  await sendLocalEmail(recipients, emailData);
  return { status: "sent" };
}

async function buildLocalPeriodEmailData(
  userId: string,
  year: number,
  month: number,
  periodType: LocalEmailPeriodType
): Promise<LocalPeriodEmailData | null> {
  const { previousYear, previousMonth, windowStartMonth } =
    resolveComparisonPeriod(year, month, periodType);
  const windowStart = new Date(year, windowStartMonth - 1, 1);
  const windowEnd = new Date(year, month, 0, 23, 59, 59);

  const [currentSnapshot, previousSnapshot, expenses, dividends] = await Promise.all([
    prisma.monthlySnapshot.findFirst({
      where: {
        userId,
        year,
        month,
        isDummy: false,
      },
    }),
    prisma.monthlySnapshot.findFirst({
      where: {
        userId,
        year: previousYear,
        month: previousMonth,
        isDummy: false,
      },
    }),
    prisma.expense.findMany({
      where: {
        userId,
        date: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
    }),
    prisma.dividend.findMany({
      where: {
        userId,
        paymentDate: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
    }),
  ]);

  if (!currentSnapshot) {
    return null;
  }

  const currentNetWorth = currentSnapshot.totalNetWorth;
  const previousNetWorth = previousSnapshot?.totalNetWorth ?? 0;
  const netWorthDelta = currentNetWorth - previousNetWorth;
  const netWorthDeltaPct =
    previousNetWorth !== 0 ? (netWorthDelta / Math.abs(previousNetWorth)) * 100 : 0;
  const expenseAggregation = aggregateExpenses(expenses);
  const dividendAggregation = aggregateDividends(dividends);

  return {
    periodType,
    year,
    month,
    currentNetWorth,
    previousNetWorth,
    netWorthDelta,
    netWorthDeltaPct,
    liquidNetWorth: currentSnapshot.liquidNetWorth,
    byAssetClass: mapNumberRecord(currentSnapshot.byAssetClass),
    byParticipant: mapParticipants(currentSnapshot.byParticipant, currentNetWorth),
    ...expenseAggregation,
    ...dividendAggregation,
  };
}

async function sendLocalEmail(
  recipients: string[],
  data: LocalPeriodEmailData
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "noreply@example.com",
    to: recipients,
    subject: `${getSubjectPrefix(data.periodType)} ${formatPeriodTitle(data)} - Net Worth Tracker`,
    html: generateLocalEmailHtml(data),
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}

function resolvePeriodCoordinates(
  periodType: LocalEmailPeriodType,
  now: Date
): PeriodCoordinates {
  if (periodType === "quarterly") {
    return getMostRecentCompletedQuarterEnd(now);
  }

  if (periodType === "yearly") {
    return getMostRecentCompletedYearEnd(now);
  }

  return getItalyMonthYear(now);
}

function getMostRecentCompletedQuarterEnd(now: Date): PeriodCoordinates {
  const italyDate = getItalyDate(now);
  const year = italyDate.getFullYear();
  const quarterEndMonths = [12, 9, 6, 3];

  for (const month of quarterEndMonths) {
    const quarterEnd = new Date(year, month - 1, new Date(year, month, 0).getDate());
    if (italyDate > quarterEnd) {
      return { year, month };
    }
  }

  return { year: year - 1, month: 12 };
}

function getMostRecentCompletedYearEnd(now: Date): PeriodCoordinates {
  const italyDate = getItalyDate(now);
  return { year: italyDate.getFullYear() - 1, month: 12 };
}

function resolveComparisonPeriod(
  year: number,
  month: number,
  periodType: LocalEmailPeriodType
): { previousYear: number; previousMonth: number; windowStartMonth: number } {
  if (periodType === "quarterly") {
    return {
      previousYear: month === 3 ? year - 1 : year,
      previousMonth: month === 3 ? 12 : month - 3,
      windowStartMonth: month - 2,
    };
  }

  if (periodType === "yearly") {
    return {
      previousYear: year - 1,
      previousMonth: 12,
      windowStartMonth: 1,
    };
  }

  return {
    previousYear: month === 1 ? year - 1 : year,
    previousMonth: month === 1 ? 12 : month - 1,
    windowStartMonth: month,
  };
}

function aggregateExpenses(
  expenses: Array<{ type: string; amount: number; categoryName: string; notes: string | null }>
): Pick<
  LocalPeriodEmailData,
  "totalIncome" | "totalExpenses" | "topExpenseCategories"
> {
  const categories = new Map<string, number>();
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const expense of expenses) {
    const amount = Math.abs(expense.amount);
    if (expense.type === "income") {
      totalIncome += amount;
    } else {
      totalExpenses += amount;
      categories.set(
        expense.categoryName,
        (categories.get(expense.categoryName) ?? 0) + amount
      );
    }
  }

  return {
    totalIncome,
    totalExpenses,
    topExpenseCategories: Array.from(categories.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

function aggregateDividends(
  dividends: Array<{ grossAmountEur: number | null; grossAmount: number }>
): Pick<LocalPeriodEmailData, "dividendTotal" | "dividendCount"> {
  return {
    dividendTotal: dividends.reduce(
      (sum, dividend) => sum + (dividend.grossAmountEur ?? dividend.grossAmount),
      0
    ),
    dividendCount: dividends.length,
  };
}

function mapNumberRecord(input: unknown): Record<string, number> {
  if (!isRecord(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, number] => {
      return typeof entry[1] === "number";
    })
  );
}

function mapParticipants(
  input: unknown,
  currentNetWorth: number
): Array<{ name: string; amount: number; percent: number }> {
  if (!isRecord(input)) {
    return [];
  }

  return Object.values(input)
    .filter(isRecord)
    .map((entry) => ({
      name: typeof entry.participantName === "string" ? entry.participantName : "",
      amount: typeof entry.totalValue === "number" ? entry.totalValue : 0,
      percent:
        currentNetWorth > 0 && typeof entry.totalValue === "number"
          ? (entry.totalValue / currentNetWorth) * 100
          : 0,
    }))
    .filter((entry) => entry.name && entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function generateLocalEmailHtml(data: LocalPeriodEmailData): string {
  const assetRows = Object.entries(data.byAssetClass)
    .sort(([, a], [, b]) => b - a)
    .map(([name, amount]) => `<li>${name}: ${formatEur(amount)}</li>`)
    .join("");
  const participantRows = data.byParticipant
    .map((participant) => `<li>${participant.name}: ${formatEur(participant.amount)}</li>`)
    .join("");

  return `<!doctype html>
<html>
<body>
  <h1>${formatPeriodTitle(data)}</h1>
  <p>Patrimonio netto: ${formatEur(data.currentNetWorth)}</p>
  <p>Variazione: ${formatEur(data.netWorthDelta)} (${data.netWorthDeltaPct.toFixed(2)}%)</p>
  <p>Liquidita: ${formatEur(data.liquidNetWorth)}</p>
  <p>Entrate: ${formatEur(data.totalIncome)} - Uscite: ${formatEur(data.totalExpenses)}</p>
  <p>Dividendi: ${formatEur(data.dividendTotal)} (${data.dividendCount})</p>
  <h2>Asset class</h2>
  <ul>${assetRows}</ul>
  <h2>Partecipanti</h2>
  <ul>${participantRows}</ul>
</body>
</html>`;
}

function formatPeriodTitle(data: LocalPeriodEmailData): string {
  if (data.periodType === "yearly") {
    return `${data.year}`;
  }

  if (data.periodType === "quarterly") {
    return `Q${Math.ceil(data.month / 3)} ${data.year}`;
  }

  return `${MONTH_NAMES[data.month - 1]} ${data.year}`;
}

function getSubjectPrefix(periodType: LocalEmailPeriodType): string {
  if (periodType === "quarterly") {
    return "Riepilogo Trimestrale";
  }

  if (periodType === "yearly") {
    return "Riepilogo Annuale";
  }

  return "Riepilogo";
}

function getEnabledKey(
  periodType: LocalEmailPeriodType
): "monthlyEmailEnabled" | "quarterlyEmailEnabled" | "yearlyEmailEnabled" {
  if (periodType === "quarterly") {
    return "quarterlyEmailEnabled";
  }

  if (periodType === "yearly") {
    return "yearlyEmailEnabled";
  }

  return "monthlyEmailEnabled";
}

function getPeriodLabel(periodType: LocalEmailPeriodType): string {
  if (periodType === "quarterly") {
    return "trimestrale";
  }

  if (periodType === "yearly") {
    return "annuale";
  }

  return "mensile";
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

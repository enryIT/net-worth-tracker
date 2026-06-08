/**
 * POST /api/user/monthly-email/send
 *
 * Allows an authenticated user to trigger a periodic summary email immediately.
 * Accepts an optional JSON body with `periodType` ('monthly' | 'quarterly' | 'semiannual' | 'yearly').
 * When omitted, defaults to 'monthly'. Resolves the most recently completed period
 * automatically (e.g. April 19 2026 → March for quarterly, H2 2025 for semiannual, 2025 for yearly).
 * `periodType: 'weekly-budget'` sends the weekly budget status email for the current state instead.
 *
 * Auth: Firebase ID token via Authorization: Bearer <token>
 * Body: { periodType?: 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'weekly-budget' }
 * Returns: { success: true } or error JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSettingsAdmin,
  buildAndSendForPeriod,
  getMostRecentCompletedQuarterEnd,
  getMostRecentCompletedHalfYearEnd,
  getMostRecentCompletedYearEnd,
  type EmailPeriodType,
} from '@/lib/server/monthlyEmailService';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { buildAndSendWeeklyBudget } from '@/lib/server/weeklyBudgetEmailService';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = decodedToken.uid;

    // Parse optional body — default to monthly
    const body = await request.json().catch(() => ({})) as { periodType?: string };

    // Weekly budget email is a separate builder (not a snapshot-based period summary).
    if (body.periodType === 'weekly-budget') {
      const settings = await getSettingsAdmin(userId);
      if (!settings?.weeklyBudgetEmailEnabled) {
        return NextResponse.json({ error: "L'email budget settimanale non è abilitata per questo account" }, { status: 400 });
      }
      if (!settings.monthlyEmailRecipients?.length) {
        return NextResponse.json({ error: 'Nessun destinatario configurato' }, { status: 400 });
      }
      const sent = await buildAndSendWeeklyBudget(userId, settings.monthlyEmailRecipients, new Date());
      if (!sent) {
        return NextResponse.json({ error: 'Nessun budget configurato: crea prima un budget' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    const periodType: EmailPeriodType =
      body.periodType === 'quarterly' ||
      body.periodType === 'semiannual' ||
      body.periodType === 'yearly'
        ? body.periodType
        : 'monthly';

    // Auto-resolve the most recently completed period for each type
    let year: number;
    let month: number;
    if (periodType === 'quarterly') {
      ({ year, month } = getMostRecentCompletedQuarterEnd(new Date()));
    } else if (periodType === 'semiannual') {
      ({ year, month } = getMostRecentCompletedHalfYearEnd(new Date()));
    } else if (periodType === 'yearly') {
      ({ year, month } = getMostRecentCompletedYearEnd(new Date()));
    } else {
      ({ year, month } = getItalyMonthYear(new Date()));
    }

    const settings = await getSettingsAdmin(userId);

    // Check the correct toggle per period type
    const enabledKey =
      periodType === 'quarterly'
        ? 'quarterlyEmailEnabled'
        : periodType === 'semiannual'
        ? 'semiAnnualEmailEnabled'
        : periodType === 'yearly'
        ? 'yearlyEmailEnabled'
        : 'monthlyEmailEnabled';

    if (!settings?.[enabledKey]) {
      const periodLabel =
        periodType === 'quarterly'
          ? 'trimestrale'
          : periodType === 'yearly'
          ? 'annuale'
          : 'mensile';
      return NextResponse.json(
        { error: `L'email ${periodLabel} non è abilitata per questo account` },
        { status: 400 }
      );
    }
    if (!settings.monthlyEmailRecipients?.length) {
      return NextResponse.json({ error: 'Nessun destinatario configurato' }, { status: 400 });
    }

    const sent = await buildAndSendForPeriod(
      userId,
      settings.monthlyEmailRecipients,
      periodType,
      year,
      month
    );
    if (!sent) {
      return NextResponse.json(
        { error: 'Nessuno snapshot trovato per il periodo richiesto: salva prima uno snapshot' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error sending periodic email:', error);
    return NextResponse.json(
      { error: "Impossibile inviare l'email", details: (error as Error).message },
      { status: 500 }
    );
  }
}

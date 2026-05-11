/**
 * POST /api/user/monthly-email/send
 *
 * Allows an authenticated user to trigger a periodic summary email immediately.
 * Accepts an optional JSON body with `periodType` ('monthly' | 'quarterly' | 'yearly').
 * When omitted, defaults to 'monthly'. Resolves the most recently completed period
 * automatically (e.g. April 19 2026 → March for quarterly, 2025 for yearly).
 *
 * Auth: Firebase ID token via Authorization: Bearer <token>
 * Body: { periodType?: 'monthly' | 'quarterly' | 'yearly' }
 * Returns: { success: true } or error JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSettingsAdmin,
  buildAndSendForPeriod,
  getMostRecentCompletedQuarterEnd,
  getMostRecentCompletedYearEnd,
  type EmailPeriodType,
} from '@/lib/server/monthlyEmailService';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = decodedToken.uid;

    // Parse optional body — default to monthly
    const body = await request.json().catch(() => ({})) as { periodType?: string };
    const periodType: EmailPeriodType =
      body.periodType === 'quarterly' || body.periodType === 'yearly'
        ? body.periodType
        : 'monthly';

    // Auto-resolve the most recently completed period for each type
    let year: number;
    let month: number;
    if (periodType === 'quarterly') {
      ({ year, month } = getMostRecentCompletedQuarterEnd(new Date()));
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

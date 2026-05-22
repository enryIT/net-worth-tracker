import { NextRequest, NextResponse } from 'next/server';
import {
  AuthSessionError,
  requireUserSession,
} from '@/lib/server/auth/session';
import {
  buildAssistantMonthContext,
  buildAssistantYearContext,
  buildAssistantYtdContext,
  buildAssistantHistoryContext,
} from '@/lib/services/assistantMonthContextService';
import { getDefaultAssistantPreferences } from '@/lib/server/assistant/webSearchPolicy';
import { getLocalAssistantMemoryDocument } from '@/lib/server/assistant/localAssistantMemoryService';
import { getLocalSettings } from '@/lib/server/settings/localSettingsService';

/**
 * GET /api/ai/assistant/context
 *
 * Reconstructs the numeric context bundle for a given period synchronously,
 * without streaming. Used to repopulate the context panel when opening an
 * existing analysis thread that has a pinned period but no active SSE stream.
 *
 * The server always rebuilds the bundle from source data rather than caching it
 * on the thread document — keeps the streaming and storage layers independent.
 *
 * Query params by mode:
 *   month_analysis: ?userId=&year=&month=
 *   year_analysis:  ?userId=&mode=year_analysis&year=
 *   ytd_analysis:   ?userId=&mode=ytd_analysis
 *   history_analysis: ?userId=&mode=history_analysis (reads startYear from settings)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUserSession();

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') ?? 'month_analysis';

    // Load user preferences to honour includeDummySnapshots for test accounts.
    // Errors are non-fatal — fall back to safe defaults.
    const memoryDoc = await getLocalAssistantMemoryDocument(user.id).catch(() => null);
    const preferences = {
      ...getDefaultAssistantPreferences(),
      ...(memoryDoc?.preferences ?? {}),
    };
    const includeDummy = preferences.includeDummySnapshots ?? false;

    let bundle;

    if (mode === 'ytd_analysis') {
      bundle = await buildAssistantYtdContext(user.id, includeDummy);
    } else if (mode === 'history_analysis') {
      const settings = await getLocalSettings(user.id);
      const startYear = settings?.cashflowHistoryStartYear ?? new Date().getFullYear() - 5;
      bundle = await buildAssistantHistoryContext(user.id, startYear, includeDummy);
    } else if (mode === 'year_analysis') {
      const yearParam = searchParams.get('year');
      if (!yearParam) {
        return NextResponse.json({ error: 'year is required for year_analysis' }, { status: 400 });
      }
      const year = parseInt(yearParam, 10);
      if (isNaN(year)) {
        return NextResponse.json({ error: 'year must be a valid integer' }, { status: 400 });
      }
      bundle = await buildAssistantYearContext(user.id, year, includeDummy);
    } else {
      // Default: month_analysis
      const yearParam = searchParams.get('year');
      const monthParam = searchParams.get('month');
      if (!yearParam || !monthParam) {
        return NextResponse.json(
          { error: 'year and month are required for month_analysis' },
          { status: 400 }
        );
      }
      const year = parseInt(yearParam, 10);
      const month = parseInt(monthParam, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { error: 'year and month must be valid integers (month 1–12)' },
          { status: 400 }
        );
      }
      bundle = await buildAssistantMonthContext(user.id, { year, month }, includeDummy);
    }

    return NextResponse.json({ bundle });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('[assistant/context] GET failed:', error);
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 });
  }
}

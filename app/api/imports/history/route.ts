import { NextRequest, NextResponse } from 'next/server';
import {
  isCsvImportCashflowCommitServiceError,
  listCsvImportCashflowBatches,
} from '@/lib/server/imports/cashflowCommitService';
import { groupCsvImportCashflowBatchesByRun } from '@/lib/server/imports/cashflowImportRunGrouping';
import { normalizeCsvImportCashflowBatchApiRecord } from '@/lib/server/imports/cashflowImportRunRouteHelpers';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import type { CsvImportCashflowImportRun } from '@/lib/server/imports/cashflowCommitTypes';

type LegacyCsvImportCashflowImportRun = Omit<
  CsvImportCashflowImportRun,
  'createdAt' | 'committedAt' | 'rolledBackAt' | 'rollbackReason'
>;

type LegacyCsvImportCashflowImportRunWithOmittedFields = LegacyCsvImportCashflowImportRun & Partial<
  Pick<CsvImportCashflowImportRun, 'createdAt' | 'committedAt' | 'rolledBackAt' | 'rollbackReason'>
>;

function toLegacyCsvImportCashflowImportRun(
  run: CsvImportCashflowImportRun
): LegacyCsvImportCashflowImportRun {
  const legacyRun = { ...run } as LegacyCsvImportCashflowImportRunWithOmittedFields;

  delete legacyRun.createdAt;
  delete legacyRun.committedAt;
  delete legacyRun.rolledBackAt;
  delete legacyRun.rollbackReason;

  return legacyRun;
}

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const history = await listCsvImportCashflowBatches(decodedToken.uid);
    const groupedHistory = groupCsvImportCashflowBatchesByRun(
      history.map((batch) => normalizeCsvImportCashflowBatchApiRecord(batch))
    );
    const legacyGroupedHistory = groupedHistory.map(toLegacyCsvImportCashflowImportRun);

    return NextResponse.json(
      { ok: true, data: legacyGroupedHistory },
      { status: 200 }
    );
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isCsvImportCashflowCommitServiceError(error)) {
      const responseBody: Record<string, unknown> = { error: error.message };
      if (error.details !== undefined) {
        responseBody.details = error.details;
      }

      return NextResponse.json(responseBody, { status: error.status });
    }

    console.error('[GET /api/imports/history] Unable to load CSV import history:', error);
    return NextResponse.json(
      { error: 'Errore durante il caricamento dello storico import CSV' },
      { status: 500 }
    );
  }
}

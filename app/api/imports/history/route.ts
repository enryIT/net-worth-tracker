import { NextRequest, NextResponse } from 'next/server';
import {
  isCsvImportCashflowCommitServiceError,
  listCsvImportCashflowBatches,
} from '@/lib/server/imports/cashflowCommitService';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const history = await listCsvImportCashflowBatches(decodedToken.uid);

    return NextResponse.json(
      { ok: true, data: history },
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

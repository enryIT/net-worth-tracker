import { NextRequest, NextResponse } from 'next/server';
import {
  isCsvImportCashflowCommitServiceError,
  listCsvImportCashflowImportRuns,
} from '@/lib/server/imports/cashflowCommitService';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const groupedRuns = await listCsvImportCashflowImportRuns(decodedToken.uid);

    return NextResponse.json(
      { ok: true, data: groupedRuns },
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

    console.error('[GET /api/imports/runs] Unable to load CSV import runs:', error);
    return NextResponse.json(
      { error: 'Errore durante il caricamento delle importazioni raggruppate' },
      { status: 500 }
    );
  }
}

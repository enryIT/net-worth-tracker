import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  isCsvImportCashflowCommitServiceError,
  rollbackCsvImportCashflowImportRun,
} from '@/lib/server/imports/cashflowCommitService';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';

const rollbackBodySchema = z
  .object({
    rollbackReason: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importRunId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { importRunId } = await params;

    if (!importRunId?.trim()) {
      return NextResponse.json(
        { error: 'Payload non valido' },
        { status: 400 }
      );
    }

    const rawBody = await request.text();
    let body: unknown = {};

    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { error: 'Payload non valido' },
          { status: 400 }
        );
      }
    }

    const parsedBody = rollbackBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Payload non valido',
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const result = parsedBody.data.rollbackReason
      ? await rollbackCsvImportCashflowImportRun(decodedToken.uid, importRunId, parsedBody.data.rollbackReason)
      : await rollbackCsvImportCashflowImportRun(decodedToken.uid, importRunId);

    return NextResponse.json({ ok: true, data: result });
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

    console.error('[POST /api/imports/runs/[importRunId]/rollback] Unable to roll back CSV import run:', error);
    return NextResponse.json(
      { error: 'Errore durante l\'annullamento dell\'importazione raggruppata' },
      { status: 500 }
    );
  }
}

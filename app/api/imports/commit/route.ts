import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  commitCsvImportCashflowBatch,
  isCsvImportCashflowCommitServiceError,
} from '@/lib/server/imports/cashflowCommitService';
import type { ImportIssueCode } from '@/lib/server/imports/types';
import { getApiAuthErrorResponse, requireFirebaseAuth, assertSameUser } from '@/lib/server/apiAuth';

const importIssueCodes = [
  'missing_required_mapping',
  'unknown_mapped_column',
  'conflicting_amount_mapping',
  'incomplete_debit_credit_mapping',
  'duplicated_source_column_mapping',
  'missing_required_field',
  'invalid_date',
  'invalid_amount',
  'invalid_number',
  'ambiguous_debit_credit',
  'amount_mismatch',
  'possible_duplicate',
  'row_processing_error',
  'classification_low_confidence',
] as const satisfies readonly ImportIssueCode[];

const importIssueSchema = z
  .object({
    code: z.enum(importIssueCodes),
    severity: z.enum(['blocking', 'warning']),
    message: z.string().trim().min(1),
    field: z.string().trim().min(1).optional(),
    rowIndex: z.number().int().positive().optional(),
  })
  .strict();

const canonicalFieldsSchema = z
  .object({
    date: z.string().trim().min(1),
    description: z.string().trim().min(1),
    amount: z.number().finite(),
    currency: z.string().trim().min(1),
    sourceType: z.string().trim().min(1).nullable(),
    sourceAccount: z.string().trim().min(1).nullable(),
    destinationAccount: z.string().trim().min(1).nullable(),
    assetTicker: z.string().trim().min(1).nullable(),
    assetIsin: z.string().trim().min(1).nullable(),
    assetName: z.string().trim().min(1).nullable(),
    quantity: z.number().finite().nullable(),
    unitPrice: z.number().finite().nullable(),
    fees: z.number().finite().nullable(),
    taxes: z.number().finite().nullable(),
    paymentDate: z.string().trim().min(1).nullable().optional(),
    exDate: z.string().trim().min(1).nullable().optional(),
    grossAmount: z.number().finite().nullable().optional(),
    taxAmount: z.number().finite().nullable().optional(),
    netAmount: z.number().finite().nullable().optional(),
    dividendType: z.string().trim().min(1).nullable().optional(),
    linkedMovementReference: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

const commitRowSchema = z
  .object({
    rowIndex: z.number().int().positive(),
    movementKind: z.enum(['cashflow', 'transfer', 'investmentOperation', 'dividend', 'fee', 'tax', 'unknown']),
    ready: z.boolean(),
    dedupeKey: z.string().trim().min(1),
    dedupeStatus: z.enum(['unique', 'possibleDuplicate', 'duplicate']),
    issues: z.array(importIssueSchema),
    canonicalFields: canonicalFieldsSchema,
    categoryId: z.string().trim().min(1).nullable(),
    categoryName: z.string().trim().min(1).nullable(),
    subCategoryId: z.string().trim().min(1).nullable().optional(),
    subCategoryName: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.movementKind !== 'cashflow' && row.movementKind !== 'fee' && row.movementKind !== 'tax') {
      return;
    }

    if (!row.categoryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'categoryId obbligatoria per le righe cashflow, fee e tax',
        path: ['categoryId'],
      });
    }

    if (!row.categoryName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'categoryName obbligatoria per le righe cashflow, fee e tax',
        path: ['categoryName'],
      });
    }
  });

const commitBodySchema = z
  .object({
    userId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1),
    presetId: z.string().trim().min(1).nullable().optional(),
    sourceFingerprint: z.string().trim().min(1).nullable().optional(),
    rows: z.array(commitRowSchema).min(1),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Payload non valido' },
        { status: 400 }
      );
    }

    const parsedBody = commitBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Payload non valido',
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    assertSameUser(decodedToken, parsedBody.data.userId);

    const result = await commitCsvImportCashflowBatch(decodedToken.uid, parsedBody.data);

    return NextResponse.json(
      { ok: true, data: result },
      { status: 201 }
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

    console.error('[POST /api/imports/commit] Unable to commit CSV import:', error);
    return NextResponse.json(
      { error: 'Errore durante la conferma import CSV' },
      { status: 500 }
    );
  }
}

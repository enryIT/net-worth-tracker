import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deleteCsvImportPreset,
  isCsvImportPresetServiceError,
  updateCsvImportPreset,
} from '@/lib/server/imports/presetService';
import { getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';

const mappedColumnNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\r\n]/.test(value), {
    message: 'Colonna non valida',
  });

const updatePresetBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    sourceLabel: z.string().trim().min(1).max(160).nullable().optional(),
    mapping: z
      .object({
        date: mappedColumnNameSchema.optional(),
        description: mappedColumnNameSchema.optional(),
        amount: mappedColumnNameSchema.optional(),
        debit: mappedColumnNameSchema.optional(),
        credit: mappedColumnNameSchema.optional(),
        currency: mappedColumnNameSchema.optional(),
        sourceType: mappedColumnNameSchema.optional(),
        sourceAccount: mappedColumnNameSchema.optional(),
        destinationAccount: mappedColumnNameSchema.optional(),
        assetTicker: mappedColumnNameSchema.optional(),
        assetIsin: mappedColumnNameSchema.optional(),
        assetName: mappedColumnNameSchema.optional(),
        quantity: mappedColumnNameSchema.optional(),
        unitPrice: mappedColumnNameSchema.optional(),
        fees: mappedColumnNameSchema.optional(),
        taxes: mappedColumnNameSchema.optional(),
      })
      .strict()
      .optional(),
    locale: z
      .object({
        dateFormats: z.array(z.string().trim().min(1)).min(1),
        decimalSeparator: z.union([z.literal(','), z.literal('.')]),
        thousandsSeparator: z.union([
          z.literal(','),
          z.literal('.'),
          z.literal(' '),
          z.literal("'"),
        ]),
        defaultCurrency: z.string().trim().min(1).max(8),
      })
      .strict()
      .optional(),
    classificationRules: z
      .array(
        z
          .object({
            field: z.enum([
              'description',
              'sourceType',
              'sourceAccount',
              'destinationAccount',
              'assetTicker',
              'assetIsin',
              'assetName',
              'currency',
            ]),
            operator: z.enum(['contains', 'equals', 'startsWith', 'endsWith', 'regex']),
            value: z.string().trim().min(1).max(300),
            movementKind: z.enum([
              'cashflow',
              'transfer',
              'investmentOperation',
              'dividend',
              'fee',
              'tax',
              'unknown',
            ]),
            caseSensitive: z.boolean().optional(),
          })
          .strict()
      )
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value).length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Nessun campo da aggiornare',
      });
    }
  });

async function updateHandler(
  request: NextRequest,
  { params }: { params: Promise<{ presetId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { presetId } = await params;

    if (!presetId) {
      return NextResponse.json(
        { error: 'Payload non valido' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsedBody = updatePresetBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Payload non valido',
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const updatedPreset = await updateCsvImportPreset(
      decodedToken.uid,
      presetId,
      parsedBody.data
    );

    return NextResponse.json({ ok: true, data: updatedPreset });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isCsvImportPresetServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('[PATCH /api/imports/presets/[presetId]] Unable to update preset:', error);
    return NextResponse.json(
      { error: 'Errore durante l\'aggiornamento del preset' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ presetId: string }> }
) {
  return updateHandler(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ presetId: string }> }
) {
  return updateHandler(request, context);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ presetId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { presetId } = await params;

    if (!presetId) {
      return NextResponse.json(
        { error: 'Payload non valido' },
        { status: 400 }
      );
    }

    await deleteCsvImportPreset(decodedToken.uid, presetId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isCsvImportPresetServiceError(error)) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error('[DELETE /api/imports/presets/[presetId]] Unable to delete preset:', error);
    return NextResponse.json(
      { error: 'Errore durante l\'eliminazione del preset' },
      { status: 500 }
    );
  }
}

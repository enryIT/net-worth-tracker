import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createCsvImportPreset,
  isCsvImportPresetServiceError,
  listCsvImportPresets,
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

const mappingSchema = z
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
  .strict();

const createPresetBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    sourceLabel: z.string().trim().min(1).max(160).nullable().optional(),
    mapping: mappingSchema,
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
      .strict(),
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
  .strict();

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const presets = await listCsvImportPresets(decodedToken.uid);

    return NextResponse.json({ ok: true, data: presets });
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

    console.error('[GET /api/imports/presets] Unable to list presets:', error);
    return NextResponse.json(
      { error: 'Errore durante il caricamento dei preset' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = await request.json();

    const parsedBody = createPresetBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Payload non valido',
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    const preset = await createCsvImportPreset(decodedToken.uid, parsedBody.data);

    return NextResponse.json(
      { ok: true, data: preset },
      { status: 201 }
    );
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

    console.error('[POST /api/imports/presets] Unable to create preset:', error);
    return NextResponse.json(
      { error: 'Errore durante la creazione del preset' },
      { status: 500 }
    );
  }
}

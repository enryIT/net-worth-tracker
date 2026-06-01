import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase/admin';
import { buildCsvImportPreview } from '@/lib/server/imports/previewService';

const importColumnMappingSchema = z.object({
  date: z.string().optional(),
  description: z.string().optional(),
  amount: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  currency: z.string().optional(),
  sourceType: z.string().optional(),
  sourceAccount: z.string().optional(),
  destinationAccount: z.string().optional(),
  assetTicker: z.string().optional(),
  assetIsin: z.string().optional(),
  assetName: z.string().optional(),
  quantity: z.string().optional(),
  unitPrice: z.string().optional(),
  fees: z.string().optional(),
  taxes: z.string().optional(),
});

const requestSchema = z.object({
  userId: z.string().min(1, 'userId obbligatorio'),
  csvText: z.string().min(1, 'csvText obbligatorio'),
  mapping: importColumnMappingSchema,
  locale: z.object({
    dateFormats: z.array(z.string()).min(1),
    decimalSeparator: z.union([z.literal(','), z.literal('.')]),
    thousandsSeparator: z.union([
      z.literal(','),
      z.literal('.'),
      z.literal(' '),
      z.literal("'"),
    ]),
    defaultCurrency: z.string().min(1),
  }),
  parser: z
    .object({
      delimiter: z.union([
        z.literal(','),
        z.literal(';'),
        z.literal('\t'),
        z.literal('|'),
      ]).optional(),
      hasHeader: z.boolean().optional(),
    })
    .optional(),
  maxRows: z.number().int().positive().max(5000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing Authorization bearer token' },
        { status: 401 }
      );
    }

    const idToken = authorization.slice('Bearer '.length).trim();
    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing Firebase ID token' },
        { status: 401 }
      );
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (error) {
      console.error('[POST /api/imports/validate] Firebase token verification failed:', error);
      return NextResponse.json(
        { error: 'Invalid or expired Firebase ID token' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsedBody = requestSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Payload non valido',
          details: parsedBody.error.flatten(),
        },
        { status: 400 }
      );
    }

    if (decodedToken.uid !== parsedBody.data.userId) {
      return NextResponse.json(
        { error: 'Authenticated user does not match requested user' },
        { status: 403 }
      );
    }

    const preview = buildCsvImportPreview(parsedBody.data);
    return NextResponse.json({ ok: true, data: preview });
  } catch (error) {
    console.error('[POST /api/imports/validate] Preview validation failed:', error);
    return NextResponse.json(
      { error: 'Errore durante la validazione anteprima import CSV' },
      { status: 500 }
    );
  }
}

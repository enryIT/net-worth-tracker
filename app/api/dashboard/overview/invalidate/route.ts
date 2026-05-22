import { NextRequest, NextResponse } from 'next/server';
import { AuthSessionError, requireUserSession } from '@/lib/server/auth/session';
import { invalidateLocalDashboardOverviewSummary } from '@/lib/server/dashboard/localDashboardOverviewInvalidationService';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * POST /api/dashboard/overview/invalidate
 *
 * Private endpoint that marks the server-owned overview materialized summary as stale
 * after a client-side mutation succeeds.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    let body: unknown = {};

    try {
      body = await request.json();
    } catch (error) {
      // Invalid or empty JSON body is non-fatal here: keep the default reason and log explicitly.
      console.warn('Failed to parse overview invalidation request body, using default reason', {
        userId: user.id,
        operation: 'POST /api/dashboard/overview/invalidate',
        error: getErrorMessage(error),
      });
    }

    const requestBody =
      typeof body === 'object' && body !== null
        ? body as { reason?: unknown }
        : {};

    const reason = typeof requestBody.reason === 'string' && requestBody.reason.trim().length > 0
      ? requestBody.reason.trim()
      : 'client_mutation';

    await invalidateLocalDashboardOverviewSummary(user.id, reason);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Failed to invalidate dashboard overview summary', {
      operation: 'POST /api/dashboard/overview/invalidate',
      error: getErrorMessage(error),
    });
    return NextResponse.json(
      { error: 'Si e verificato un errore durante l\'invalidazione dashboard.' },
      { status: 500 }
    );
  }
}

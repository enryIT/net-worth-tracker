import { NextRequest, NextResponse } from 'next/server';
import { AuthSessionError, requireUserSession } from '@/lib/server/auth/session';
import { getLocalDashboardOverview } from '@/lib/server/dashboard/localDashboardOverviewService';

/**
 * GET /api/dashboard/overview
 *
 * Private overview endpoint for the dashboard landing page.
 * The authenticated local session is the only authoritative user identity.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUserSession();
    const payload = await getLocalDashboardOverview(user.id);

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Error getting dashboard overview:', error);
    return NextResponse.json(
      { error: 'Si e verificato un errore durante il recupero dashboard.' },
      { status: 500 }
    );
  }
}

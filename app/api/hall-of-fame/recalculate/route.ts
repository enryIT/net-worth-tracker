import { NextRequest, NextResponse } from 'next/server';
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from '@/lib/server/auth/session';
import { updateLocalHallOfFame } from '@/lib/server/hall-of-fame/localHallOfFameService';

/**
 * POST /api/hall-of-fame/recalculate
 *
 * Manually trigger Hall of Fame rankings recalculation for a single user
 *
 * Request Body:
 *   {
 *     userId: string  // Required
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     message: string
 *   }
 *
 * Use Cases:
 *   - Manual refresh after data corrections
 *   - Recovery from failed automatic updates
 *   - Admin operations
 *
 * Related:
 *   - hallOfFameService.server.ts: Ranking calculation logic
 *   - portfolio/snapshot/manual/route.ts: Automatic trigger after snapshot
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    await updateLocalHallOfFame(user.id);

    return NextResponse.json({
      success: true,
      message: 'Hall of Fame ricalcolata correttamente.',
    });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 }
      );
    }

    console.error('Error recalculating Hall of Fame:', error);
    return NextResponse.json(
      { error: 'Si e verificato un errore durante il ricalcolo Hall of Fame.' },
      { status: 500 }
    );
  }
}

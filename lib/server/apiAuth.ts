import { NextRequest, NextResponse } from 'next/server';
import { AuthSessionError, requireUserSession } from '@/lib/server/auth/session';

class ApiAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiAuthError';
    this.status = status;
  }
}

type LegacyAuthToken = {
  uid: string;
  email?: string | null;
  name?: string | null;
};

/**
 * Resolve the authenticated user from local session auth and expose a
 * uid-compatible token object for legacy API helpers.
 *
 * Why this exists:
 * - Legacy routes still consume `requireFirebaseAuth()` + uid checks
 * - New auth comes from local server sessions, not bearer token verification
 * - This adapter keeps route behavior stable during migration
 */
export async function requireFirebaseAuth(
  request: NextRequest
): Promise<LegacyAuthToken> {
  void request;

  const user = await requireUserSession();
  const legacyToken: LegacyAuthToken = { uid: user.id };

  if (typeof user.email !== 'undefined') {
    legacyToken.email = user.email;
  }

  if (typeof user.name !== 'undefined') {
    legacyToken.name = user.name;
  }

  return legacyToken;
}

/**
 * Enforce that the authenticated user matches the target userId.
 *
 * This closes the class of bugs where the client can swap userId in query/body
 * while still sending a valid token for a different account.
 */
export function assertSameUser(
  decodedToken: LegacyAuthToken,
  requestedUserId: string | null | undefined
): void {
  if (!requestedUserId) {
    throw new ApiAuthError(400, 'User ID is required');
  }

  if (decodedToken.uid !== requestedUserId) {
    throw new ApiAuthError(403, 'Authenticated user does not match requested user');
  }
}

/**
 * Enforce resource ownership on records loaded server-side.
 */
export function assertResourceOwner(
  decodedToken: LegacyAuthToken,
  ownerUserId: string | null | undefined
): void {
  if (!ownerUserId) {
    throw new ApiAuthError(403, 'Resource owner is missing');
  }

  if (decodedToken.uid !== ownerUserId) {
    throw new ApiAuthError(403, 'Resource does not belong to authenticated user');
  }
}

export function getApiAuthErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof ApiAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof AuthSessionError) {
    const status = error.code === 'DEMO_READONLY' ? 403 : 401;
    return NextResponse.json({ error: error.message }, { status });
  }

  return null;
}

/**
 * Send private API requests using the local Auth.js cookie session.
 *
 * Migrated route handlers resolve ownership from the server-side session, so the
 * client wrapper must not attach legacy Firebase bearer tokens.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'same-origin',
  });
}

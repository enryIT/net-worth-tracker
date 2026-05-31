---
name: api-auth-routes
description: Creates or edits authenticated `app/api/*` routes using the route family's current auth layer: either legacy Firebase UID helpers (`requireFirebaseAuth`, `assertSameUser`, `assertResourceOwner`, `getApiAuthErrorResponse`) or the local-session helpers (`requireUserSession`, `assertWritableUser`, `AuthSessionError`) used by PostgreSQL-backed routes. Use when user says 'secure this route', 'add private API', or 'auth for API'. Do NOT use for public endpoints or UI-only work.
---
# API Auth Routes

## Critical

1. Private `app/api/*` routes must verify the authenticated user server-side before any resource access or mutation.
2. Use the route family's auth helpers exactly as existing routes do:
   - Local PostgreSQL-backed routes usually use `requireUserSession()` from `lib/server/auth/session.ts` and `assertWritableUser()` for mutations.
   - Legacy Firebase-backed routes may still use `requireFirebaseAuth()`, `assertSameUser()`, `assertResourceOwner()`, and `getApiAuthErrorResponse()` from `lib/server/apiAuth.ts`.
   - `getApiAuthErrorResponse()` for auth failures
   - `assertSameUser()` when the request user must match a target UID
   - `assertResourceOwner()` when the request user must own the resource being accessed
3. Never return raw auth errors or custom ad hoc auth payloads when the route family already has a standard auth failure shape.
4. Do not skip ownership checks even if the route already checks authentication.
5. Verify the route shape against existing `app/api/*` routes before writing code.

## Instructions

1. **Find the matching route pattern in `app/api/*` and its helper usage in `lib/server/*`.**
   - Inspect existing private routes under `app/api/ai/assistant/*`, `app/api/dividends/*`, `app/api/performance/*`, `app/api/portfolio/snapshot/*`, or `app/api/prices/*`.
   - Look for imports from `lib/server/auth/session.ts`, `lib/server/apiAuth.ts`, and any route-specific authorization helpers.
   - Match the route handler style already used in the project: `export async function GET(...)`, `POST(...)`, `PUT(...)`, or `DELETE(...)`.
   - **Verify** the target route is private and identify whether it uses local-session auth or legacy Firebase auth before proceeding to the next step.

2. **Add or preserve server-side auth in the route handler.**
   - For local PostgreSQL-backed routes, import `requireUserSession()` from `lib/server/auth/session.ts`; for mutations also call `assertWritableUser(user)` after the session is loaded.
   - For legacy Firebase-backed routes, import the auth helper from `lib/server/apiAuth.ts`.
   - Use the same pattern as neighboring routes to extract the user and gate the handler immediately.
   - If the route is public, do not add these checks; this skill is only for authenticated routes.
   - **This step uses the output from Step 1. Verify** the route returns the same auth failure shape as existing private routes before proceeding.

3. **Use same-user or local-session ownership checks when the request carries user identity.**
   - Apply this check when the client submits something like `userId`, `uid`, or a similar identifier that must equal the authenticated Firebase UID.
   - For local-session routes, prefer ignoring legacy client-supplied `userId` fields and use `user.id` from `requireUserSession()` unless the route family already validates a supplied ID.
   - Keep the check near the top of the handler, before DB reads or writes.
   - Follow existing project convention: throw or return the same error response pattern used in `lib/server/apiAuth.ts` and the current route.
   - **This step uses the output from Step 2. Verify** the request UID cannot differ from the authenticated UID before proceeding to the next step.

4. **Use `assertResourceOwner()` for resource-level authorization.**
   - When the route reads or mutates a resource by ID, check that the authenticated user owns that resource before continuing.
   - Apply it to routes that operate on records fetched from Firestore or other server-side stores.
   - Keep the ownership guard before update/delete logic and before any data returned to the client.
   - **This step uses the output from Step 3. Verify** ownership is enforced on every read/write path before proceeding to the next step.

5. **Return auth failures using the route family's standard shape.**
   - In the route file, use `getApiAuthErrorResponse()` for unauthorized/forbidden responses exactly as existing routes do.
   - In local-session routes, catch `AuthSessionError` and return the same 401/403 JSON shape used by neighboring local routes.
   - Do not invent new auth JSON shapes, status codes, or error messages unless the current route family already uses them.
   - Keep the response consistent for all auth failure branches.
   - **This step uses the output from Step 4. Verify** auth failures match the project’s existing response shape before proceeding to the next step.

6. **Preserve the route’s existing data flow and service boundaries.**
   - Keep business logic in `lib/server/*` or `lib/services/*` when the codebase already does so.
   - Use route handlers only for request parsing, auth checks, and response formatting.
   - If the route calls a server use case, reuse the same input/output types from `types/*` and the same imports already present in the feature area.
   - **This step uses the output from Step 5. Verify** the route still matches the existing separation of concerns before proceeding to validation.

7. **Validate with the project’s standard checks.**
   - Run the relevant targeted test when available, for example:
     - `npm.cmd test -- --run __tests__/assistantRoutes.test.ts`
     - `npm.cmd test -- --run __tests__/householdUtils.test.ts`
   - Run `npx tsc --noEmit` to confirm route types and helper imports compile.
   - Run `npm.cmd run lint` if the route introduces new imports or formatting-sensitive changes.
   - **Verify** tests and typecheck pass before considering the route complete.

## Examples

**User says:** “Secure this private API route.”

**Actions taken:**
1. Open the existing file under `app/api/<feature>/route.ts`.
2. Import and use the same auth helper pattern as neighboring routes (`lib/server/auth/session.ts` for local-session routes, `lib/server/apiAuth.ts` for legacy Firebase routes).
3. Add `assertSameUser()` if the request includes a UID.
4. Add `assertResourceOwner()` if the handler loads a resource by ID.
5. Return failures with `getApiAuthErrorResponse()`.
6. Run the relevant Vitest file and `npx tsc --noEmit`.

**Result:** The route behaves like the rest of the authenticated API layer: server-side auth is enforced, unauthorized access is blocked early, and responses match the project’s existing auth error shape.

## Common Issues

- **If you see `Unauthorized` or `Forbidden` responses returning a different JSON shape than nearby routes:**
  1. Replace custom `NextResponse.json({ error: ... })` auth branches with `getApiAuthErrorResponse()`.
  2. Compare the handler with another private route in `app/api/*` that already uses the helper.

- **If you see `Firebase UID mismatch` or a failed same-user check:**
  1. Confirm the route is using `assertSameUser()` on the exact request field that carries the UID.
  2. Verify the client is not sending `userId` from a different account.
  3. Check the authenticated Firebase UID extracted by `lib/server/apiAuth.ts`.

- **If you see `Resource owner mismatch` or access denied on an existing record:**
  1. Confirm the resource ID is loaded before the ownership check.
  2. Verify `assertResourceOwner()` receives the authenticated UID and the fetched resource owner field.
  3. Make sure the route is not skipping ownership validation on update/delete branches.

- **If you see `Module not found: Can't resolve 'lib/server/apiAuth'` or a similar import error:**
  1. Use the exact project path `lib/server/apiAuth.ts`.
  2. Match the import style used by existing authenticated routes.

- **If `npx tsc --noEmit` fails with a route handler type error:**
  1. Check the handler signature matches Next.js App Router conventions in `app/api/*`.
  2. Ensure request parsing and return values match the types used in neighboring routes.
  3. Reuse existing request/response types from `types/*` when available.
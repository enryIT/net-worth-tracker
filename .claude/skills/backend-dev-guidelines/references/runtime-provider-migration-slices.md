# Runtime Provider Migration Slices

Use this reference when migrating a React/Next.js app away from an old runtime data provider such as Firebase toward local API routes and Prisma-backed server services.

## Durable pattern from cost-center and expense-category slices

Problem shape:

- A UI-facing `lib/services/*` client wrapper still imports the old SDK.
- Local API routes and Prisma services already exist for the primary entity.
- One wrapper helper also reads associated child records through the old SDK.
- Legacy client wrappers may perform cascade writes into denormalized child rows.

Recommended sequence:

1. Add RED client-wrapper tests first.
   - Mock the old SDK boundary.
   - Assert the wrapper calls local API routes with `credentials: "same-origin"`.
   - Assert old SDK functions are not called.
   - Preserve legacy wrapper signatures as compatibility shims when ownership now comes from session context; name unused args `_userId`.

2. If an associated child-read helper exists, add a narrow local server service method instead of putting Prisma in the wrapper.
   - Example shape: `listLocalExpensesForCostCenter(userId, costCenterId)`.
   - Keep user scoping server-side.
   - Use an indexed query path and explicit ordering suitable for the UI.

3. Extend the existing local route parser only as much as needed.
   - Example: allow `costCenterId` on `/api/expenses` and delegate to the dedicated service method.
   - Strip helper-only query fields before passing options to the generic list service.
   - Keep route handlers thin: session, validation, delegation, response.

4. Move cascade logic server-side when the old wrapper updated denormalized child data.
   - Example: expense category renames/type changes/subcategory renames should update owned local expenses in the Prisma service, not by importing the old expense SDK from the client wrapper.
   - Preserve domain semantics such as income/non-income sign flips.
   - Use service tests for the cascade because the route should remain a thin delegation layer.

5. Run targeted GREEN tests across all touched boundaries.
   - Client wrapper test.
   - Route test when a route changed or is newly introduced.
   - Server service test for persistence, scoping, and cascade behavior.
   - Existing nearby route/service tests as broader regression coverage even when route code is unchanged.

6. Update the migration handoff with changed, verified, remaining, and residual provider hits.

## Legacy wrapper compatibility-shim pattern

Use this when the old public service module is still imported by UI code, but equivalent local API-backed wrappers already exist.

Recommended sequence:

1. Change the client-wrapper test to import the legacy public module path, not only the new local wrapper. This proves existing callers are covered.
2. Add a source-level regression assertion for forbidden runtime imports when the old provider initializes at module load. Example: read the legacy wrapper file and assert it does not match `firebase/firestore` or `lib/firebase/config`.
3. Run the RED test before implementation. A module-collection failure from provider initialization is a valid RED result when the purpose is to remove runtime initialization from the wrapper path.
4. Replace the legacy module with a narrow compatibility shim that re-exports the already-tested local API-backed wrapper functions. Do not port old client-side transactions when server routes/services already own persistence and ownership checks.
5. Run the migrated wrapper test plus nearby local wrapper/route/service tests to prove the shim still preserves behavior.
6. Update the migration handoff with the exact removed runtime path and the residual full-repo provider search. Do not claim global removal unless the full search is clean.

This pattern is especially useful for deleting hundreds of lines of old SDK code safely while preserving import compatibility.

## Authenticated fetch local-session boundary pattern

Use this when a shared client fetch helper still imports the legacy auth provider only to attach bearer tokens, but migrated local API routes already authenticate with server-side cookie/session helpers.

Recommended sequence:

1. Confirm the relevant `app/api/*` routes use local session helpers and do not still require the legacy bearer-token auth path.
2. Add a RED source-level test for the helper that forbids imports such as `@/lib/firebase/config`, `firebase/auth`, or `firebase/firestore`.
3. Add behavior coverage proving the helper calls `fetch` with `credentials: "same-origin"` by default and does not inject `Authorization: Bearer ...`.
4. Replace the helper with a compatibility shim that preserves the public function signature and uses `credentials: init.credentials ?? "same-origin"`.
5. Run representative caller tests, TypeScript, diff checks, and a final residual provider search.
6. Report remaining provider hits honestly; the boundary test itself may still contain provider strings in the forbidden-import regex.

See `references/authenticated-fetch-local-session-boundary.md` for the detailed checklist and pitfalls.

## Shared utility/type boundary pattern

Use this when a shared utility or type-adjacent helper imports an old provider only for a narrow data shape, such as Firestore `Timestamp`, but the runtime behavior only needs a small method like `toDate()`.

Recommended sequence:

1. Add a RED module-boundary test that reads the source file and asserts it does not match old provider imports such as `firebase/firestore` or `lib/firebase/config`.
2. Keep or add behavior tests for the existing accepted inputs: native `Date`, strings, null/undefined fallbacks, and provider-like objects exposing the tiny structural method.
3. Replace the SDK-specific import with a local structural type, for example `type TimestampLike = { toDate: () => Date }`.
4. Update comments away from provider-specific language where the helper is now provider-agnostic.
5. Run the targeted utility tests, nearby tests that import the utility indirectly, TypeScript, and a final residual provider search.
6. Report remaining provider hits honestly; a local type named `TimestampLike` may still match broad grep patterns but should not be described as a provider runtime import.

Pitfalls:

- Do not import the provider package just to get a type for a structural object; that can keep runtime dependencies alive in shared client/server modules.
- Do not use `instanceof ProviderTimestamp` checks after migration; they require importing the provider class. Prefer duck typing when existing behavior already accepts provider-like objects.
- Do not broaden the slice into every shared type file at once. Remove one active boundary at a time and preserve compile stability.

## Category-assignment bulk-operation route pattern

Use a dedicated local API route for UI wrapper helpers that previously performed category-scoped Firestore reads/writes or batches. Keep the legacy helper signatures stable, but make each helper POST an explicit action to a session-scoped route such as `/api/expenses/category-assignment`.

Recommended server shape:

- Route validates a discriminated action body with Zod, resolves the local user session, applies demo/write guards for mutations, then delegates.
- Server service owns Prisma access and implements bulk operations with `updateMany` where possible.
- Count actions can use normal authenticated session access; write actions must use the stricter writable-user/demo guard.
- Clear/deleted-category operations should map to the local runtime's canonical fallback values, for example `categoryId: "uncategorized"`, `categoryName: "Uncategorized"`, and `subCategoryId: null` when that is the established app behavior.
- Moves between income and non-income category types must preserve domain semantics; if local expenses store income positive and non-income expenses negative, the server service must flip `amount` signs during the move and cover that with service tests.

Test coverage to add first:

- Client wrapper: asserts local API calls and no old provider SDK calls.
- Route: asserts unauthenticated, demo-readonly/write guard, validation, action dispatch, and status shape.
- Service: asserts ownership scoping, bulk update payloads, fallback values, and income/non-income sign-flip behavior.

## Pitfalls

- Do not preserve old Firestore batching/client write behavior in a client wrapper when a local route can enforce ownership and transactions server-side.
- Do not let compatibility `userId` arguments become trusted ownership inputs after migration; server session owns scoping.
- Do not claim provider removal just because the selected wrapper is clean; rerun the full residual usage search and report remaining hits.
- If `npm install` mutates a lockfile without an intentional dependency change, inspect and revert that unrelated lockfile change before staging.
- Do not keep importing a legacy child service from a migrated wrapper just to preserve cascade side effects; move those effects to the server-side service and test ownership-scoped updates there.
- Do not update denormalized financial rows without checking signed amount conventions; category type moves can require amount sign inversion, not just category ID/name replacement.

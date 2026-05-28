# Authenticated Fetch Local Session Boundary

Use this reference when a shared client fetch helper still imports Firebase/Auth or another legacy auth SDK only to attach bearer tokens, while migrated App Router API routes already use a local cookie/session helper server-side.

## Problem shape

- A widely imported client utility such as `lib/utils/authFetch.ts` imports the legacy client auth provider at module load.
- The helper reads the current provider user and injects `Authorization: Bearer <legacy-token>` into private API requests.
- Migrated `app/api/*` routes resolve ownership from a local server-side session helper such as `requireUserSession()` and no longer call the legacy `requireFirebaseAuth()` path.
- Many callers still depend on the helper name/signature, so changing all call sites would be broader than the intended slice.

## Narrow slice sequence

1. Confirm route-side auth posture before coding:
   - search `app/api` for legacy auth helpers such as `requireFirebaseAuth`;
   - verify the relevant migrated routes use the local session helper;
   - document any remaining legacy route/server helpers as caveats.
2. Add a RED boundary test for the helper:
   - read the helper source file as text;
   - assert it does not import legacy auth/provider modules such as `@/lib/firebase/config`, `firebase/auth`, or `firebase/firestore`;
   - add behavior coverage proving calls default to `credentials: "same-origin"` and do not add bearer-token headers.
3. Run the test before implementation and confirm it fails for the expected provider import/token behavior, not for test harness setup.
4. Replace the helper implementation with a compatibility shim:
   - preserve the exported function name and signature;
   - call `fetch(input, { ...init, credentials: init.credentials ?? "same-origin" })`;
   - do not create a `Headers` object unless the new local-session behavior actually needs to edit headers;
   - preserve explicit caller-supplied `credentials` values.
5. Run targeted and broader tests that cover representative callers of the helper, plus full TypeScript and diff checks.
6. Rerun the residual provider search. The helper should disappear from provider runtime hits; the new boundary test may still appear because it contains the forbidden-import regex.
7. If setup commands mutate a lockfile without an intentional dependency change, inspect and revert the lockfile before staging.

## Pitfalls

- Do not keep importing the legacy auth provider in the test just to mock it after the migration; the point is to prove the helper can load without provider initialization.
- Do not remove the helper or change every call site in the same slice; keeping the helper as a compatibility boundary limits blast radius.
- Do not assume all APIs are migrated just because the helper is clean. Report remaining server/service provider hits honestly.
- Do not claim bearer-token auth was removed globally while legacy server helpers or tests still reference it.

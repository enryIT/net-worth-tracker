# Provider Helper Neutralization

Use this reference when a migration slice targets a small helper module that still imports an old runtime provider, especially auth/session/retry helpers.

## Trigger

- Residual provider search finds a helper such as `lib/utils/*Helper.ts` importing an old SDK.
- Initial usage search suggests it is unused or low-risk.
- The helper API is still useful as a compatibility boundary, but its provider import/name leaks the old runtime.

## Checklist

1. Run the requested residual provider search, but do not assume its directory list is exhaustive.
2. Search for the helper by module name and exported function names across likely adjacent roots, including `contexts/`, `providers/`, `src/`, and other app entrypoint folders, not only `app lib components types __tests__`.
3. Add a RED source-level boundary test before changing production code:
   - assert the helper source has no old-provider import or vocabulary;
   - assert active callers no longer import old provider-specific helper names;
   - build forbidden regexes without embedding the exact residual-search tokens when the final global search should stay clean.
4. If a deletion attempt reveals a live caller via `tsc`, do not continue with deletion. Restore/replace the helper as a neutral compatibility wrapper.
5. Replace SDK-specific types with structural local types that express only the required shape, for example `{ getIdToken(forceRefresh?: boolean): Promise<string> }`.
6. Rename exported helpers away from provider-specific vocabulary:
   - `waitForAuthTokenRefresh` -> `waitForSessionReady`
   - `retryFirestoreOperation` -> `retryPermissionSensitiveOperation`
7. Update current callers to the neutral names with minimal behavior change.
8. Run focused boundary tests, nearby auth/session tests, full typecheck, and a final residual provider search.
9. Document any discovered caller outside the standard migration search scope as a future migration target.

## Pitfalls

- Deleting a helper solely because `rg` in the prompt's scope shows no callers can break adjacent roots such as `contexts/`.
- Boundary tests that contain the exact residual-search tokens can keep the global residual count artificially high. Split strings in regex construction when the test itself must mention forbidden tokens.
- Do not broaden the slice into a full auth migration just because an auth context is still provider-backed. Neutralize the helper boundary, document the larger target, and stop.

# Shared Type Provider Boundary Slices

Use this when a shared `types/*` file imports a legacy runtime provider SDK only for a date/timestamp type during a provider migration such as Firebase -> local API/Postgres.

## Pattern

1. Pick exactly one shared type file or one tightly coupled type cluster.
2. Add a RED source-level Vitest guard before editing production code:
   - read the target source file with `readFileSync`;
   - assert it does not import the old provider package, e.g. `firebase/firestore` or `@/lib/firebase/config`;
   - import Vitest globals explicitly.
3. Run the test and confirm it fails because the target file imports the provider, not because of test harness setup.
4. Replace SDK-specific imported types with a local structural compatibility type when only a tiny behavior shape is needed:
   ```ts
   export type DomainDateLike = {
     toDate(): Date;
   };
   ```
5. Update affected fields from `Date | ProviderTimestamp` to `Date | DomainDateLike`.
6. Avoid provider vocabulary in new type names. If the residual search includes `Timestamp`, naming the replacement `TimestampLike` may keep the file in the migration hit list even after runtime dependency removal. Prefer domain-neutral names such as `GoalDateLike` or `InvestmentDateLike`.
7. Run the targeted boundary test, nearby domain tests, TypeScript, and `git diff --check -- <touched files>`.
8. Rerun the residual provider search and verify the touched type file disappeared from provider-import hits. Do not claim full provider removal unless the entire search is clean.

## Notes

- This is a boundary slice, not a full storage migration. Document remaining runtime services or other shared types as caveats rather than broadening the slice.
- If setup commands mutate lockfiles without an intentional dependency change, inspect and revert those unrelated lockfile changes before staging.
- If the worktree contains unrelated untracked agent/skill directories or local tooling artifacts, leave them alone and stage only the exact boundary-slice files. Do not let unrelated local scaffolding contaminate the commit.

## Proven examples

- `types/hall-of-fame.ts`: replace an imported Firebase `Timestamp` type with a local `HallOfFameDateLike = { toDate(): Date }` type for note and aggregate update timestamps, add a source-level boundary test such as `__tests__/hallOfFameTypesFirebaseBoundary.test.ts`, then run nearby Hall of Fame/local snapshot tests plus full TypeScript.

# Household Shared Type Provider Boundary

Use this reference when migrating a household-related shared type file away from Firebase/Firestore timestamp imports while preserving compatibility with legacy serialized values.

## Trigger

- A shared household type file imports `firebase/firestore` only for `Timestamp` typing.
- The runtime migration goal is to remove Firebase from normal app paths without broad service rewrites.
- Existing values may still be `Date` or provider-like timestamp objects with `toDate()`.

## Pattern

1. Add a source-level Vitest boundary test before editing production code.
2. The test should read the target file and reject provider imports such as:
   - `from 'firebase/firestore'`
   - `from '@/lib/firebase/config'`
3. Confirm RED fails because the type file still imports Firebase, not because of test setup.
4. Replace the SDK type import with a domain-neutral structural type:

```ts
export type HouseholdDateLike = {
  toDate(): Date;
};
```

5. Replace household date fields from `Date | Timestamp` to `Date | HouseholdDateLike`.
6. Keep the slice narrow: do not migrate household services/routes unless the selected slice explicitly covers those paths.
7. Run the boundary test, nearby household tests, TypeScript, diff check, and residual provider search.
8. Update the migration handoff with changed files, RED/GREEN evidence, typecheck result, and remaining provider hits.

## Representative verification set

```bash
npm test -- --run __tests__/householdTypesFirebaseBoundary.test.ts
npm test -- --run __tests__/householdTypesFirebaseBoundary.test.ts __tests__/householdUtils.test.ts __tests__/householdFeatureRegression.test.ts __tests__/householdServiceClient.test.ts __tests__/localHouseholdService.test.ts __tests__/localHouseholdRoutes.test.ts __tests__/assistantMonthContextService.test.ts
npx tsc --noEmit --incremental false
git diff --check -- types/household.ts __tests__/householdTypesFirebaseBoundary.test.ts docs/firebase-to-postgres-migration-handoff.md
rg -n "firebase|Firestore|adminDb|Timestamp|requireFirebaseAuth|lib/firebase" app lib components types __tests__
```

## Pitfalls

- Avoid naming the replacement `TimestampLike`; broad residual searches often include `Timestamp`, so the new type name can keep the migrated file in the hit list.
- Do not claim full Firebase removal after a shared type boundary slice. Only claim the specific touched file no longer imports the provider.
- If setup commands mutate lockfiles without intentional dependency changes, revert those lockfile changes before staging.

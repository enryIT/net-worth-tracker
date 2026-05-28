# Asset shared type provider boundary

Use this reference when a shared domain type file imports an old runtime provider SDK only for timestamp/date typing during a provider migration.

## Pattern

1. Add a source-level Vitest boundary test before editing production types.
   - Read the target type file as text.
   - Assert it does not import `firebase/firestore` or the provider config module.
   - Import Vitest globals explicitly: `import { describe, expect, it } from 'vitest';`.
2. Run the test and confirm RED fails for the provider import, not for harness/setup.
3. Replace SDK timestamp types with a domain-neutral structural type:

```ts
export type AssetDateLike = {
  toDate(): Date;
};
```

4. Replace `Date | Timestamp` with `Date | AssetDateLike` in the shared type boundary.
5. Avoid provider vocabulary in the new type name. Prefer names tied to the domain (`AssetDateLike`, `InvestmentDateLike`, `GoalDateLike`) rather than `TimestampLike` when the residual migration search includes `Timestamp`.
6. Run the boundary test, nearby domain tests that import the type, full typecheck, and diff checks.
7. Update the migration handoff document with RED/GREEN evidence and remaining provider hits.

## Example commands

```bash
npm test -- --run __tests__/assetTypesFirebaseBoundary.test.ts
npm test -- --run __tests__/assetTypesFirebaseBoundary.test.ts __tests__/assetHistoryUtils.test.ts __tests__/assetDialogHelpers.test.ts __tests__/couponUtils.test.ts __tests__/localAutomatedSnapshotService.test.ts __tests__/chartService.test.ts __tests__/fireService.test.ts __tests__/householdUtils.test.ts __tests__/assetAllocationServiceClientMigration.test.ts
npx tsc --noEmit --incremental false
git diff --check -- types/assets.ts __tests__/assetTypesFirebaseBoundary.test.ts docs/firebase-to-postgres-migration-handoff.md
```

## Caveats

- This removes a type-level/runtime import boundary only. Do not claim provider runtime removal unless the full residual search is clean.
- If `npm install` mutates the lockfile during setup without an intentional dependency change, inspect and revert the lockfile before staging.
- Stage only the touched type, test, and handoff files for this slice; do not use `git add .`.

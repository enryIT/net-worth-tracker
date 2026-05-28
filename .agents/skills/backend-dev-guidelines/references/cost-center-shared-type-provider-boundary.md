# Cost Center Shared Type Provider Boundary Variant

Use this as a compact example when migrating a shared cost-center type file away from Firebase runtime/type imports while preserving compatibility with existing date-like values.

## Trigger

A shared file such as `types/costCenters.ts` imports `Timestamp` from `firebase/firestore` only to type `createdAt` / `updatedAt`, and the migration goal is to remove provider runtime dependencies from normal app code without broad rewrites.

## Worked Pattern

1. Add a source-level RED Vitest guard before changing the type file.
   ```ts
   import { readFileSync } from 'node:fs';
   import { join } from 'node:path';
   import { describe, expect, it } from 'vitest';

   describe('cost center shared types Firebase boundary', () => {
     it('does not import Firebase runtime modules', () => {
       const source = readFileSync(join(process.cwd(), 'types/costCenters.ts'), 'utf8');
       const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

       expect(source).not.toMatch(forbiddenFirebaseImport);
     });
   });
   ```
2. Run the test and confirm it fails because the target file still imports Firebase, not because of test harness setup.
3. Replace the provider type import with a domain-neutral structural type:
   ```ts
   export type CostCenterDateLike = {
     toDate(): Date;
   };
   ```
4. Change date fields from `Date | Timestamp` to `Date | CostCenterDateLike`.
5. Run the targeted boundary test, nearby cost-center/cashflow tests, full TypeScript, and a diff whitespace check for touched files.
6. Rerun the residual provider search and verify `types/costCenters.ts` disappeared from hits. Do not claim full Firebase removal unless the full search is clean.

## Useful Nearby Regression Set

For the Net Worth Tracker cost-center boundary slice, the useful broader test set was:

```bash
npm test -- --run \
  __tests__/costCenterTypesFirebaseBoundary.test.ts \
  __tests__/costCenterServiceClient.test.ts \
  __tests__/localCostCenterService.test.ts \
  __tests__/localCostCentersRoutes.test.ts \
  __tests__/localExpenseService.test.ts \
  __tests__/localExpensesRoutes.test.ts
```

## Pitfalls

- Do not name the replacement type `TimestampLike`; it keeps the file in residual `Timestamp` searches even after the Firebase import is gone.
- Do not broaden this into service or route rewrites. It is a boundary slice whose value is removing provider imports from shared types while preserving current consumers.
- If `npm install` or setup commands mutate the lockfile without an intentional dependency change, restore that unrelated lockfile change before staging.

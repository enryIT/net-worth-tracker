# Dividend shared type provider boundary

Use this reference when a shared dividend domain type imports an old runtime provider SDK only for date/timestamp typing during a provider migration such as Firebase to local API/Postgres.

## Pattern

1. Add a source-level Vitest boundary test before editing production types.
   - Read `types/dividend.ts` as text.
   - Assert it does not import `firebase/firestore` or the provider config module.
   - Import Vitest globals explicitly: `import { describe, expect, it } from 'vitest';`.
2. Run the test and confirm RED fails for the provider import, not for test harness setup.
3. Replace SDK timestamp types with a domain-neutral structural type tied to the domain:

```ts
export type DividendDateLike = {
  toDate(): Date;
};
```

4. Replace dividend record fields such as `exDate`, `paymentDate`, `createdAt`, and `updatedAt` from `Date | ProviderTimestamp` to `Date | DividendDateLike`.
5. Avoid old-provider vocabulary in the new type name. Do not create `TimestampLike` inside the dividend type file when the residual migration search includes `Timestamp`; prefer `DividendDateLike`.
6. Run the boundary test, nearby dividend UI/API/service tests, full typecheck, and diff checks.
7. Rerun the residual provider search and verify `types/dividend.ts` disappeared from provider-import hits. Do not claim full provider removal unless the entire search is clean.

## Example commands

```bash
npm test -- --run __tests__/dividendTypesFirebaseBoundary.test.ts
npm test -- --run __tests__/dividendTypesFirebaseBoundary.test.ts __tests__/dividendUiFirebaseBoundary.test.ts __tests__/localDividendService.test.ts __tests__/localDividendsRoutes.test.ts __tests__/localDividendStatsService.test.ts __tests__/localDividendStatsRoute.test.ts __tests__/localDividendExpenseSyncService.test.ts __tests__/localDividendExpenseSyncRoute.test.ts __tests__/localDividendScrapeService.test.ts __tests__/localDividendScrapeRoute.test.ts
npx tsc --noEmit --incremental false
git diff --check -- types/dividend.ts __tests__/dividendTypesFirebaseBoundary.test.ts docs/firebase-to-postgres-migration-handoff.md
```

## Caveats

- This removes a shared type/runtime import boundary only. It does not migrate the dividend server workflows or legacy Firebase-backed services.
- Stage only the touched type, test, and handoff files for this slice; do not use `git add .`.
- If setup commands mutate `package-lock.json` without an intentional dependency change, inspect and revert that unrelated lockfile change before staging.

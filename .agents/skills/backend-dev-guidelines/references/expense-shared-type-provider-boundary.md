# Expense Shared Type Provider Boundary

Use this reference when migrating shared expense/cashflow types away from Firebase/Firestore runtime imports.

## Trigger

- `types/expenses.ts` or another shared cashflow type imports `firebase/firestore` only for `Timestamp` typing.
- The goal is to remove provider imports without changing runtime behavior or broadening into service rewrites.

## Pattern

1. Add a RED source-level Vitest boundary test that reads the target type file and rejects direct provider imports, for example:
   - `from 'firebase/firestore'`
   - `from '@/lib/firebase/config'`
2. Run the test and confirm it fails because the shared type still imports the provider.
3. Replace the SDK type import with a domain-neutral structural local type. For expenses, use a name like `ExpenseDateLike`, not `TimestampLike`, so residual searches do not keep matching provider vocabulary.
4. Include the provider-like methods actually used by existing callers. In the expense category UI, callers sort categories with `createdAt.toMillis()`, so the structural boundary must include both:
   - `toDate(): Date`
   - `toMillis(): number`
5. Update date fields to `Date | ExpenseDateLike` rather than importing Firebase.
6. Run the targeted boundary test, nearby cashflow/expense tests, and full `npx tsc --noEmit --incremental false`.
7. If TypeScript reveals additional structural methods used by callers, extend the local structural type rather than reintroducing the SDK import.
8. Update the migration handoff doc and run `git diff --check -- <touched files>` before staging exact files only.

## Verification set used in the worked slice

```bash
npm test -- --run __tests__/expenseTypesFirebaseBoundary.test.ts
npm test -- --run __tests__/expenseTypesFirebaseBoundary.test.ts __tests__/expenseUiFirebaseBoundary.test.ts __tests__/expenseCategoryAssignmentMigration.test.ts __tests__/expenseCategoryServiceClient.test.ts __tests__/localExpenseService.test.ts __tests__/localExpensesRoutes.test.ts
npx tsc --noEmit --incremental false
git diff --check -- types/expenses.ts __tests__/expenseTypesFirebaseBoundary.test.ts docs/firebase-to-postgres-migration-handoff.md
```

## Pitfall

Do not assume `{ toDate(): Date }` is enough for all provider-like date fields. Expense categories had active UI callers using `toMillis()` for sort order, and the compiler caught it. Let TypeScript drive the exact structural shape needed by the touched domain.

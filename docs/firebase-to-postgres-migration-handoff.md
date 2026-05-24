# Firebase to Postgres Migration Handoff

Date: 2026-05-22
Branch: `handoff/firebase-to-postgres-local-runtime`

This branch is a continuation branch for the Firebase-to-Postgres migration.
It is intentionally not meant to be merged into `main` until the full runtime
migration is complete.

## Goal

Remove Firebase from normal runtime and move the app to a self-hosted
PostgreSQL/Prisma backend while preserving existing workflows and user-owned
data scoping.

Primary design document:

- `docs/firebase-to-postgres-migration-design.md`

## Current State

The branch contains a large vertical-slice migration. Runtime Firebase has been
removed from many private API paths and replaced with:

- Prisma/Postgres models in `prisma/schema.prisma`
- `lib/server/prisma.ts`
- local Auth.js/NextAuth session helpers
- local route handlers under `app/api/*`
- local server services under `lib/server/*`
- Vitest route/service coverage for migrated paths

The worktree was intentionally committed as a handoff branch rather than a PR.
Continue development on this branch and merge later only after final runtime
acceptance is satisfied.

## Completed Slices

### Foundation

- Added PostgreSQL/Prisma dependencies and schema foundation.
- Added local Auth.js/NextAuth routes and server session helper.
- Added local registration, password credentials, TOTP enrollment, recovery-code
  support, login/session/audit tables, and tests.
- Added local settings and preferences services/routes.
- Redirected `lib/services/userPreferencesService.ts` to the local
  `/api/user/preferences` route so the color theme client wrapper no longer
  imports Firebase at runtime.
- Added app data export/import and legacy import scaffolding.

### Core Financial Data

- Migrated local assets read/write APIs and services.
- Migrated snapshots, manual snapshots, automated snapshots, monthly snapshot
  cron service/route, and tests.
- Migrated goal-based investing reads/writes from the Firebase client wrapper to
  a local `/api/goals` route backed by `UserSetting.data.goalBasedInvesting`.
- Migrated cashflow slices:
  - expenses
  - expense categories
  - budgets
  - cost centers
  - internal transfers
  - investment operations
- Added/updated client wrappers for budget, cost centers, expense categories,
  internal transfers, investment operations where needed.

### Dividends, Prices, Performance, Dashboard

- Migrated dividends CRUD, stats, scrape, sync-expenses, daily cron services and
  routes.
- Migrated performance yield endpoints.
- Migrated quote and price update routes/services.
- Migrated benchmark cache routes/services.
- Migrated dashboard overview read and invalidation services/routes.
- Migrated Hall of Fame recalculation.
- Migrated periodic email local route/service.

### Assistant

- Migrated assistant threads and messages to local Prisma-backed storage.
- Migrated assistant stream route to local session and local persistence.
- Migrated assistant memory route/service and memory extraction after a
  successful stream response.
- Migrated assistant context route to local session and local settings.
- Migrated `assistantMonthContextService.ts` away from Firebase Admin fetchers;
  it now reads snapshots, expenses, settings, and assets through local
  Prisma-backed services.
- Preserved household scope propagation into assistant context.

### Household

- Migrated `lib/services/householdService.ts` away from Firebase client SDK.
- Added local household routes:
  - `app/api/household/config/route.ts`
  - `app/api/household/audit/route.ts`
- Added `lib/server/household/localHouseholdService.ts`.
- Stores `householdConfig` in `UserSetting.data.householdConfig`.
- Stores household audit events in local `AuditEvent` rows.

## Recent Validation Evidence

The following commands passed during the latest handoff preparation:

```bash
npm test -- --run __tests__/userPreferencesServiceClient.test.ts __tests__/localUserPreferencesRoutes.test.ts __tests__/localUserPreferencesService.test.ts
```

Result: 3 test files, 10 tests passed.

```bash
npx tsc --noEmit --incremental false
```

Result: passed after swap was made available in the validation environment.

```bash
npm test -- --run __tests__/householdUtils.test.ts __tests__/householdFeatureRegression.test.ts __tests__/pdfHouseholdData.test.ts __tests__/localAutomatedSnapshotService.test.ts __tests__/localHouseholdService.test.ts __tests__/localHouseholdRoutes.test.ts __tests__/householdServiceClient.test.ts
```

Result: 7 test files, 44 tests passed.

```bash
npm test -- --run __tests__/assistantMonthContextService.test.ts __tests__/localAssistantContextRoute.test.ts __tests__/localAssistantStreamRoute.test.ts __tests__/localSettingsService.test.ts
```

Result: 4 test files, 25 tests passed.

```bash
npx tsc --noEmit --incremental false
```

Result: passed.

```bash
git diff --check -- lib/services/householdService.ts lib/server/household/localHouseholdService.ts app/api/household/config/route.ts app/api/household/audit/route.ts __tests__/localHouseholdService.test.ts __tests__/localHouseholdRoutes.test.ts __tests__/householdServiceClient.test.ts lib/server/settings/localSettingsService.ts app/api/ai/assistant/stream/route.ts
```

Result: clean.

```bash
npm test -- --run __tests__/goalService.test.ts __tests__/goalServiceClient.test.ts __tests__/localGoalDataService.test.ts __tests__/localGoalsRoute.test.ts __tests__/assistantGoalEvaluation.test.ts
```

Result: 5 test files, 45 tests passed.

```bash
npx tsc --noEmit --incremental false
```

Result: passed.

```bash
git diff --check -- lib/services/goalService.ts lib/server/goals/localGoalDataService.ts app/api/goals/route.ts __tests__/goalServiceClient.test.ts __tests__/localGoalDataService.test.ts __tests__/localGoalsRoute.test.ts docs/firebase-to-postgres-migration-handoff.md
```

Result: clean.

```bash
npm test -- --run __tests__/localExpenseService.test.ts __tests__/localExpensesRoutes.test.ts __tests__/localCostCenterService.test.ts __tests__/localCostCentersRoutes.test.ts __tests__/costCenterServiceClient.test.ts
```

Result: 5 test files, 37 tests passed.

## Slice Notes - 2026-05-22 Cost Centers Client Wrapper

Changed:

- Redirected `lib/services/costCenterService.ts` from Firebase client SDK calls to
  local `/api/cost-centers` and `/api/expenses?costCenterId=...` calls while
  preserving the legacy wrapper signatures used by UI components.
- Added a cost-center-specific local expense list service path so cost-center
  detail reads stay user-scoped and ordered by ascending expense date.
- Extended the local expenses route query parser to delegate cost-center expense
  reads to the new server service path.
- Added client wrapper, local route, and local server-service regression tests.

Verified:

- Targeted cost center and expenses tests passed: 5 files, 37 tests.

Remaining:

- Many Firebase runtime hits remain in services and shared/client types; rerun
  the residual usage search before the next slice.
- `npx tsc --noEmit --incremental false` passed.
- `git diff --check` passed for touched files.
- Residual Firebase usage search was rerun; runtime hits still remain outside
  the cost-center wrapper slice.

## Slice Notes - 2026-05-22 Expense Categories Client Wrapper

Changed:

- Redirected `lib/services/expenseCategoryService.ts` from Firebase client SDK
  calls to local `/api/expense-categories` routes while preserving the legacy
  function signatures used by settings and expense UI components.
- Preserved category name/type cascade behavior in the Prisma-backed server
  service by updating owned local expenses when an owned category is renamed or
  moved between expense types.
- Added client wrapper regression coverage for list, create, update, delete,
  subcategory add/remove/update, local API error handling, and no-op legacy
  Firebase user arguments.
- Extended local expense category service tests to cover denormalized expense
  cascade updates and the owned-category not-found path.

Verified:

- Red tests failed before implementation for the new client wrapper and local
  cascade expectations.
- `npm test -- --run __tests__/expenseCategoryServiceClient.test.ts`
  passed: 1 file, 8 tests.
- `npm test -- --run __tests__/localExpenseCategoryService.test.ts`
  passed: 1 file, 5 tests.
- `npm test -- --run __tests__/localExpenseCategoriesRoutes.test.ts __tests__/localExpensesRoutes.test.ts __tests__/costCenterServiceClient.test.ts`
  passed: 3 files, 25 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- The category reassignment/count/move bottleneck in `lib/services/expenseService.ts`
  was migrated in the next slice below.
- Many Firebase runtime hits remain in other services and shared/client types;
  rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-22 Expense Category Assignment Helpers

Changed:

- Added `app/api/expenses/category-assignment/route.ts`, a thin local session
  route for expense category count, reassignment, clear, category move, and
  subcategory move operations.
- Added Prisma-backed bulk category assignment helpers to
  `lib/server/cashflow/localExpenseService.ts`, keeping ownership scoping inside
  server services and returning `updateMany.count` for write operations.
- Redirected the selected category-management helpers in
  `lib/services/expenseService.ts` to the local `/api/expenses/category-assignment`
  route instead of using Firestore client queries/batches.
- Added `__tests__/expenseCategoryAssignmentMigration.test.ts` to cover the
  local client wrapper calls, route auth/write guard behavior, Prisma service
  scoping, clear-category fallback, and cross income/non-income sign flipping.

Verified:

- Red test initially failed for the expected missing route module:
  `Cannot find module '@/app/api/expenses/category-assignment/route'`.
- `npm test -- --run __tests__/expenseCategoryAssignmentMigration.test.ts`
  passed: 1 file, 8 tests.
- `npm test -- --run __tests__/expenseCategoryAssignmentMigration.test.ts __tests__/localExpenseService.test.ts __tests__/localExpensesRoutes.test.ts __tests__/expenseCategoryServiceClient.test.ts`
  passed: 4 files, 38 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- `lib/services/expenseService.ts` still has other Firebase-backed helpers for
  non-category-assignment workflows, including category/subcategory rename and
  type-update cascades plus recurring/installment lookups.
- Many Firebase runtime hits remain in other services and shared/client types;
  rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-22 Asset Allocation Settings Wrapper

Changed:

- Redirected `lib/services/assetAllocationService.ts` settings reads/writes from
  Firestore client SDK calls to the local `/api/user/settings` route while
  preserving the legacy `getSettings`, `getTargets`, `setSettings`, and
  `setTargets` function signatures used by settings and FIRE UI components.
- Removed the indirect runtime import of `lib/services/assetService.ts` from the
  allocation wrapper by keeping the small asset-value calculation local to the
  allocation module.
- Kept dashboard overview invalidation as a local `/api/dashboard/overview/invalidate`
  fetch for settings fields that affect cached overview totals.
- Added `__tests__/assetAllocationServiceClientMigration.test.ts` to cover local
  settings API reads/writes, legacy target helpers, source-level Firebase import
  removal, and local allocation calculation behavior.

Verified:

- Red test initially failed because the wrapper still used Firestore
  `getDoc`/`setDoc` and still imported Firebase/`assetService`.
- `npm test -- --run __tests__/assetAllocationServiceClientMigration.test.ts`
  passed: 1 file, 5 tests.
- `npm test -- --run __tests__/assetAllocationServiceClientMigration.test.ts __tests__/localSettingsRoutes.test.ts __tests__/localSettingsService.test.ts __tests__/chartService.test.ts`
  passed: 4 files, 14 tests.
- `npx tsc --noEmit --incremental false` passed.

Caveats:

- A broader `__tests__/apiAuthRoutes.test.ts` run was attempted and failed in
  unrelated pre-existing paths because NextAuth `headers()` was invoked outside
  request scope and one cron snapshot path needs `DATABASE_URL`; this slice did
  not modify those routes.

Remaining:

- Many Firebase runtime hits remain in other services and shared/client types;
  rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-22 Legacy Investment Operation Wrapper

Changed:

- Replaced `lib/services/investmentOperationService.ts` with a compatibility
  shim that re-exports the existing local API-backed investment operation and
  internal transfer client wrappers.
- Removed the Firebase client SDK, Firestore transaction, and dashboard
  invalidation imports from that active wrapper path so components importing the
  legacy investment operation service now call local `/api/investment-operations`
  and `/api/internal-transfers` routes.
- Updated `__tests__/investmentOperationServiceClient.test.ts` to exercise the
  legacy wrapper path directly and assert that it no longer imports Firebase
  runtime modules.

Verified:

- Red test initially failed at module collection with Firebase runtime
  initialization: `FirebaseError: Firebase: Error (auth/invalid-api-key).`
- `npm test -- --run __tests__/investmentOperationServiceClient.test.ts`
  passed: 1 file, 6 tests.
- `npm test -- --run __tests__/investmentOperationServiceClient.test.ts __tests__/internalTransferServiceClient.test.ts __tests__/localInvestmentOperationService.test.ts __tests__/localInvestmentOperationsRoutes.test.ts __tests__/localInternalTransferService.test.ts __tests__/localInternalTransfersRoutes.test.ts __tests__/investmentOperationService.test.ts`
  passed: 7 files, 42 tests.
- `npx tsc --noEmit --incremental false` passed.
- `git diff --check -- lib/services/investmentOperationService.ts __tests__/investmentOperationServiceClient.test.ts docs/firebase-to-postgres-migration-handoff.md`
  passed.
- Residual Firebase usage search was rerun; runtime hits still remain outside
  the legacy investment operation wrapper slice.

Remaining:

- Many Firebase runtime hits remain in other services and shared/client types;
  rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-22 Date Helpers Timestamp Boundary

Changed:

- Removed the `firebase/firestore` import from `lib/utils/dateHelpers.ts`.
- Replaced the Firebase `Timestamp` dependency with a structural local
  `TimestampLike` type that preserves support for objects exposing `toDate()`.
- Added a module-boundary regression test in `__tests__/dateHelpers.test.ts` so
  the shared date helper cannot reintroduce Firebase runtime imports.

Verified:

- Red test initially failed because `lib/utils/dateHelpers.ts` still imported
  `firebase/firestore`.
- `npm test -- --run __tests__/dateHelpers.test.ts` passed: 1 file, 21 tests.
- `npm test -- --run __tests__/dateHelpers.test.ts __tests__/budgetUtils.test.ts __tests__/localDashboardOverviewService.test.ts __tests__/localAutomatedSnapshotService.test.ts __tests__/localPeriodicEmailService.test.ts`
  passed: 5 files, 48 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- Many Firebase runtime hits remain in other services, components, utilities,
  and shared types; rerun the residual usage search before the next slice.
- Several UI components and shared type files still import `firebase/firestore`
  `Timestamp` directly; this slice only removed the central `dateHelpers.ts`
  runtime dependency.

## Slice Notes - 2026-05-22 Dividend UI Timestamp Boundary

Changed:

- Removed direct `firebase/firestore` `Timestamp` imports from
  `components/dividends/DividendTable.tsx` and
  `components/dividends/DividendDialog.tsx`.
- Reused the structural `TimestampLike`/`toDate` date helper boundary for
  dividend table date formatting while preserving support for Date, string, and
  Firestore-like timestamp values.
- Added `__tests__/dividendUiFirebaseBoundary.test.ts` as a source-level
  regression guard so these active dividend UI files do not reintroduce direct
  Firebase runtime imports for date handling.

Verified:

- Red test initially failed because both dividend UI files imported
  `firebase/firestore` directly.
- `npm test -- --run __tests__/dividendUiFirebaseBoundary.test.ts` passed: 1
  file, 2 tests.
- `npm test -- --run __tests__/dividendUiFirebaseBoundary.test.ts __tests__/dateHelpers.test.ts __tests__/localDividendsRoutes.test.ts __tests__/localDividendService.test.ts __tests__/localDividendStatsRoute.test.ts __tests__/localDividendStatsService.test.ts __tests__/localDividendExpenseSyncRoute.test.ts __tests__/localDividendExpenseSyncService.test.ts __tests__/localDividendScrapeRoute.test.ts __tests__/localDividendScrapeService.test.ts`
  passed: 10 files, 54 tests.
- `npx tsc --noEmit --incremental false` passed.

Caveats:

- `components/dividends/DividendDialog.tsx` still imports
  `lib/services/assetService.ts`, which remains Firebase-backed and should be a
  future assets/client-wrapper migration slice. This slice only removes the
  direct Firebase date runtime dependency from dividend UI components.

Remaining:

- Many Firebase runtime hits remain in services, components, utilities, server
  code, and shared types; rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-23 Expense UI Timestamp Boundary

Changed:

- Removed direct `firebase/firestore` `Timestamp` imports from
  `components/expenses/ExpenseCard.tsx`, `components/expenses/ExpenseTable.tsx`,
  and `components/expenses/ExpenseDialog.tsx`.
- Reused the structural `TimestampLike`/`toDate` date helper boundary for expense
  card/table date formatting and edit-dialog default date conversion while
  preserving support for Date, string, and Firestore-like timestamp values.
- Added `__tests__/expenseUiFirebaseBoundary.test.ts` as a source-level
  regression guard so these active expense UI files do not reintroduce direct
  Firebase runtime imports for date handling.

Verified:

- Red test initially failed for setup because Vitest globals were not imported;
  after correcting the test harness, the red test failed for the expected reason:
  all three expense UI files still imported `firebase/firestore`.
- `npm test -- --run __tests__/expenseUiFirebaseBoundary.test.ts` passed: 1
  file, 3 tests.
- `npm test -- --run __tests__/expenseUiFirebaseBoundary.test.ts __tests__/dateHelpers.test.ts __tests__/expenseCategoryAssignmentMigration.test.ts __tests__/expenseCategoryServiceClient.test.ts`
  passed: 4 files, 42 tests.
- `npx tsc --noEmit --incremental false` passed.

Caveats:

- `components/expenses/ExpenseTable.tsx` and `components/expenses/ExpenseDialog.tsx`
  still import Firebase-backed `lib/services/assetService.ts` and
  `lib/services/expenseService.ts`; those remain future client-wrapper/service
  migration slices. This slice only removes direct Firebase date runtime
  dependencies from active expense UI components.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities, and
  shared types; rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-23 Goal UI Timestamp Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `components/goals/GoalFormDialog.tsx`.
- Replaced new-goal timestamp creation with plain `Date` values, preserving the
  existing `InvestmentGoal` contract that already accepts `Date` timestamps.
- Added `__tests__/goalUiFirebaseBoundary.test.ts` as a source-level regression
  guard so the active goal form UI does not reintroduce direct Firebase runtime
  imports for timestamp creation.

Verified:

- Red test initially failed for the expected reason: `GoalFormDialog.tsx` still
  imported `firebase/firestore`.
- `npm test -- --run __tests__/goalUiFirebaseBoundary.test.ts` passed: 1 file,
  1 test.
- `npm test -- --run __tests__/goalUiFirebaseBoundary.test.ts __tests__/goalServiceClient.test.ts __tests__/localGoalDataService.test.ts __tests__/localGoalsRoute.test.ts __tests__/assistantGoalEvaluation.test.ts`
  passed: 5 files, 25 tests.
- `npx tsc --noEmit --incremental false` passed.

Caveats:

- Shared `types/goals.ts` still imports Firebase `Timestamp`; this slice only
  removes the active goal form UI runtime dependency.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities, and
  shared types; rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-23 Goal Shared Type Timestamp Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/goals.ts`.
- Added a local structural `GoalDateLike` type so existing provider-like
  values with `toDate()` remain type-compatible without importing Firebase.
- Updated goal type comments from legacy Firestore storage wording to local
  authenticated user settings wording.
- Replaced the pure `__tests__/goalService.test.ts` timestamp fixture with a
  plain `Date` and removed the now-unneeded Firebase config mock.
- Added `__tests__/goalTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the shared goal type boundary and pure goal service
  fixture.

Verified:

- Red test initially failed for the expected reason: both `types/goals.ts` and
  `__tests__/goalService.test.ts` still imported Firebase runtime modules.
- `npm test -- --run __tests__/goalTypesFirebaseBoundary.test.ts` passed: 1 file,
  2 tests.
- `npm test -- --run __tests__/goalTypesFirebaseBoundary.test.ts __tests__/goalUiFirebaseBoundary.test.ts __tests__/goalService.test.ts __tests__/goalServiceClient.test.ts __tests__/localGoalDataService.test.ts __tests__/localGoalsRoute.test.ts __tests__/assistantGoalEvaluation.test.ts`
  passed: 7 files, 48 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-23 Investment Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/investments.ts`.
- Added a local structural `InvestmentDateLike` type so investment operation and
  internal transfer date fields remain compatible with provider-like values that
  expose `toDate()` without importing Firebase.
- Added `__tests__/investmentTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the investment shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/investments.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/investmentTypesFirebaseBoundary.test.ts` passed: 1
  file, 1 test.
- `npm test -- --run __tests__/investmentTypesFirebaseBoundary.test.ts __tests__/investmentOperationServiceClient.test.ts __tests__/internalTransferServiceClient.test.ts __tests__/localInvestmentOperationService.test.ts __tests__/localInvestmentOperationsRoutes.test.ts __tests__/localInternalTransferService.test.ts __tests__/localInternalTransfersRoutes.test.ts __tests__/investmentOperationService.test.ts`
  passed: 8 files, 43 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-23 Asset Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/assets.ts`.
- Added a local structural `AssetDateLike` type so asset, bond, snapshot, and
  price-history date fields remain compatible with provider-like values that
  expose `toDate()` without importing Firebase.
- Added `__tests__/assetTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the asset shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/assets.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/assetTypesFirebaseBoundary.test.ts` passed: 1
  file, 1 test.
- `npm test -- --run __tests__/assetTypesFirebaseBoundary.test.ts __tests__/assetHistoryUtils.test.ts __tests__/assetDialogHelpers.test.ts __tests__/couponUtils.test.ts __tests__/localAutomatedSnapshotService.test.ts __tests__/chartService.test.ts __tests__/fireService.test.ts __tests__/householdUtils.test.ts __tests__/assetAllocationServiceClientMigration.test.ts`
  passed: 9 files, 128 tests.
- `npx tsc --noEmit --incremental false` passed.
- `git diff --check -- types/assets.ts __tests__/assetTypesFirebaseBoundary.test.ts docs/firebase-to-postgres-migration-handoff.md`
  passed.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-23 Dividend Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/dividend.ts`.
- Added a local structural `DividendDateLike` type so dividend date fields remain
  compatible with provider-like values that expose `toDate()` without importing
  Firebase.
- Added `__tests__/dividendTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the dividend shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/dividend.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/dividendTypesFirebaseBoundary.test.ts` passed: 1
  file, 1 test.
- `npm test -- --run __tests__/dividendTypesFirebaseBoundary.test.ts __tests__/dividendUiFirebaseBoundary.test.ts __tests__/localDividendService.test.ts __tests__/localDividendsRoutes.test.ts __tests__/localDividendStatsService.test.ts __tests__/localDividendStatsRoute.test.ts __tests__/localDividendExpenseSyncService.test.ts __tests__/localDividendExpenseSyncRoute.test.ts __tests__/localDividendScrapeService.test.ts __tests__/localDividendScrapeRoute.test.ts`
  passed: 10 files, 34 tests.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-23 Cost Center Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/costCenters.ts`.
- Added a local structural `CostCenterDateLike` type so cost center date fields
  remain compatible with provider-like values that expose `toDate()` without
  importing Firebase.
- Added `__tests__/costCenterTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the cost center shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/costCenters.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/costCenterTypesFirebaseBoundary.test.ts` passed: 1
  file, 1 test.
- `npm test -- --run __tests__/costCenterTypesFirebaseBoundary.test.ts __tests__/costCenterServiceClient.test.ts __tests__/localCostCenterService.test.ts __tests__/localCostCentersRoutes.test.ts __tests__/localExpenseService.test.ts __tests__/localExpensesRoutes.test.ts`
  passed: 6 files, 38 tests.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-23 Expense Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/expenses.ts`.
- Added a local structural `ExpenseDateLike` type so expense and expense-category
  date fields remain compatible with provider-like values that expose `toDate()`
  and `toMillis()` without importing Firebase.
- Added `__tests__/expenseTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the expense shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/expenses.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/expenseTypesFirebaseBoundary.test.ts` passed: 1
  file, 1 test.
- `npm test -- --run __tests__/expenseTypesFirebaseBoundary.test.ts __tests__/expenseUiFirebaseBoundary.test.ts __tests__/expenseCategoryAssignmentMigration.test.ts __tests__/expenseCategoryServiceClient.test.ts __tests__/localExpenseService.test.ts __tests__/localExpensesRoutes.test.ts`
  passed: 6 files, 42 tests.
- `npx tsc --noEmit --incremental false` passed after `ExpenseDateLike` was
  expanded to include the `toMillis()` method used by category UI sorting.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-23 Budget Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/budget.ts`.
- Added a local structural `BudgetDateLike` type so budget config timestamps
  remain compatible with provider-like values that expose `toDate()` without
  importing Firebase.
- Added `__tests__/budgetTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the budget shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/budget.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/budgetTypesFirebaseBoundary.test.ts` passed: 1
  file, 1 test.
- `npm test -- --run __tests__/budgetTypesFirebaseBoundary.test.ts __tests__/budgetUtils.test.ts __tests__/budgetServiceClient.test.ts __tests__/localBudgetRoutes.test.ts __tests__/localBudgetService.test.ts`
  passed: 5 files, 31 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-23 Household Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/household.ts`.
- Added a local structural `HouseholdDateLike` type so household config,
  participant, profile, and audit date fields remain compatible with
  provider-like values that expose `toDate()` without importing Firebase.
- Added `__tests__/householdTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the household shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/household.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/householdTypesFirebaseBoundary.test.ts` passed: 1
  file, 1 test.
- `npm test -- --run __tests__/householdTypesFirebaseBoundary.test.ts __tests__/householdUtils.test.ts __tests__/householdFeatureRegression.test.ts __tests__/householdServiceClient.test.ts __tests__/localHouseholdService.test.ts __tests__/localHouseholdRoutes.test.ts __tests__/assistantMonthContextService.test.ts`
  passed: 7 files, 55 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and other shared types; rerun the residual usage search
  before the next slice.

## Slice Notes - 2026-05-24 Performance Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/performance.ts`.
- Added a local structural `PerformanceDateLike` type so serialized performance
  cache date fields remain compatible with provider-like values exposing
  `toDate()` without importing Firebase.
- Renamed the performance cache serialization type names from provider-specific
  `Firestore*` names to neutral `Serialized*` names and updated the legacy
  performance service annotations accordingly.
- Added `__tests__/performanceTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the performance shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/performance.ts` still
  imported `firebase/firestore` directly.
- `npm test -- --run __tests__/performanceTypesFirebaseBoundary.test.ts` passed:
  1 file, 1 test.
- `npm test -- --run __tests__/performanceTypesFirebaseBoundary.test.ts __tests__/performanceService.test.ts __tests__/localPerformanceYieldRoutes.test.ts __tests__/localDividendStatsService.test.ts`
  passed: 4 files, 75 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- `lib/services/performanceService.ts` itself remains Firebase-backed for its
  legacy performance cache reads/writes and should be migrated in a later local
  service/API slice.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and `types/hall-of-fame.ts`; rerun the residual usage
  search before the next slice.

## Slice Notes - 2026-05-24 Hall of Fame Shared Type Date Boundary

Changed:

- Removed the direct `firebase/firestore` `Timestamp` import from
  `types/hall-of-fame.ts`.
- Added a local structural `HallOfFameDateLike` type so Hall of Fame note and
  aggregate update timestamps remain compatible with provider-like values
  exposing `toDate()` without importing Firebase.
- Added `__tests__/hallOfFameTypesFirebaseBoundary.test.ts` as a source-level
  regression guard for the Hall of Fame shared type boundary.

Verified:

- Red test initially failed for the expected reason: `types/hall-of-fame.ts`
  still imported `firebase/firestore` directly.
- `npm test -- --run __tests__/hallOfFameTypesFirebaseBoundary.test.ts` passed:
  1 file, 1 test.
- `npm test -- --run __tests__/hallOfFameTypesFirebaseBoundary.test.ts __tests__/localHallOfFameService.test.ts __tests__/localMonthlySnapshotCronService.test.ts __tests__/localManualSnapshotService.test.ts`
  passed: 4 files, 8 tests.
- `npx tsc --noEmit --incremental false` passed.

Remaining:

- Firebase-backed Hall of Fame runtime services still remain in
  `lib/services/hallOfFameService.ts` and `lib/services/hallOfFameService.server.ts`;
  this slice only removed the shared type Firebase boundary.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, and tests; rerun the residual usage search before the next slice.

## Slice Notes - 2026-05-24 Authenticated Fetch Local Session Boundary

Changed:

- Redirected `lib/utils/authFetch.ts` away from Firebase client auth token
  lookup and bearer-token injection.
- `authenticatedFetch()` now uses the local Auth.js cookie session by defaulting
  requests to `credentials: "same-origin"` while preserving the existing helper
  signature and caller-supplied request options.
- Added `__tests__/authFetchLocalSession.test.ts` as a source-level and behavior
  regression guard so the shared fetch helper cannot reintroduce Firebase
  runtime imports or Firebase bearer-token injection.

Verified:

- Red test initially failed for the expected reasons: `authFetch.ts` still
  imported `@/lib/firebase/config` and still added a Firebase bearer token
  instead of using cookie credentials.
- `npm test -- --run __tests__/authFetchLocalSession.test.ts` passed: 1 file,
  2 tests.
- `npm test -- --run __tests__/authFetchLocalSession.test.ts __tests__/pdfHouseholdData.test.ts __tests__/localDashboardOverviewRoute.test.ts __tests__/localAssistantContextRoute.test.ts __tests__/localDividendsRoutes.test.ts`
  passed: 5 files, 16 tests.

Caveats:

- This slice assumes migrated `app/api/*` callers authenticate through the local
  cookie session. Discovery found no remaining `app/api` route importing
  `requireFirebaseAuth`, but `lib/server/apiAuth.ts` still exists as a legacy
  helper and several legacy services still use Firebase runtime dependencies.
- Final residual search still found 415 matching lines across the requested
  scope. `lib/utils/authFetch.ts` no longer appears; the only touched-file hit is
  the boundary regex in `__tests__/authFetchLocalSession.test.ts`.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and comments; rerun the residual usage search before the
  next slice.

## Known Residual Firebase Runtime Areas

The next agent should continue by reducing these remaining Firebase-dependent
paths. Do not assume this list is exhaustive; run `rg` before each slice.

High-value next targets:

- `lib/services/assetService.ts`
- `lib/services/expenseService.ts`
- `lib/services/expenseCategoryService.ts`
- `lib/services/dummySnapshotGenerator.ts`
- `lib/services/snapshotService.ts`
- `lib/services/performanceService.ts`
- `lib/services/dividendService.ts`
- `lib/services/dividendIncomeService.ts`
- `lib/server/dividendUseCase.ts`
- `lib/server/dividendProcessor.ts`
- `lib/server/monthlyEmailService.ts`
- `lib/helpers/priceUpdater.ts`
- `lib/server/assistant/store.ts`
- `lib/server/apiAuth.ts`
- `lib/utils/authFetch.ts`
- `lib/utils/authHelpers.ts`
- shared types importing `firebase/firestore` `Timestamp`

Some of these are legacy services no longer used by migrated route paths, but
they still matter for final acceptance because normal app runtime should not
require Firebase credentials.

## Recommended Next Slices

1. Map which Firebase services are still imported by active UI hooks/components.
2. Replace client service wrappers with local API wrappers one workflow at a
   time.
3. Keep migrated API routes thin: session, validation, demo write guard,
   delegate to `lib/server/*`.
4. Add red Vitest coverage before each migration slice.
5. Continue running `npx tsc --noEmit --incremental false` because the default
   incremental build can write `tsconfig.tsbuildinfo` in awkward WSL paths.
6. Avoid broad lint/audit cleanup until the migration is stable; the repo has
   historical lint noise.
7. Keep `Draft Release Temp.md` and `Temp.md` untouched.

## Branch Handoff Instructions

On the other machine:

```bash
git fetch origin
git checkout handoff/firebase-to-postgres-local-runtime
npm install
npx prisma generate
npx tsc --noEmit --incremental false
```

Then inspect:

```bash
git status --short
rg -n "firebase|Firestore|adminDb|Timestamp|requireFirebaseAuth|lib/firebase" app lib components types __tests__
```

Do not merge this branch to `main` yet. Keep committing new migration slices on
this branch until final acceptance is reached.

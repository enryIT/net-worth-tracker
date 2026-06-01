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

- Firebase-backed Hall of Fame runtime service still remains in
  `lib/services/hallOfFameService.ts`; the server compatibility wrapper was
  migrated in the 2026-05-25 slice below.
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

## Slice Notes - 2026-05-24 Dashboard Overview Server Invalidation Boundary

Changed:

- Redirected `lib/services/dashboardOverviewInvalidation.server.ts` away from
  Firebase Admin runtime access.
- Preserved the exported `invalidateDashboardOverviewSummaryServer()` helper as
  a compatibility wrapper while delegating persistence to
  `invalidateLocalDashboardOverviewSummary()` in the existing local
  Prisma-backed dashboard overview invalidation service.
- Added `__tests__/dashboardOverviewInvalidationServerMigration.test.ts` as a
  source-level and delegation regression guard so the legacy helper cannot
  reintroduce Firebase Admin imports.

Verified:

- Red test initially failed for the expected reasons: the legacy helper still
  imported `firebase-admin/firestore`, `@/lib/firebase/admin`, used `adminDb`,
  and did not call the local invalidation service.
- `npm test -- --run __tests__/dashboardOverviewInvalidationServerMigration.test.ts`
  passed: 1 file, 2 tests.
- `npm test -- --run __tests__/dashboardOverviewInvalidationServerMigration.test.ts __tests__/localDashboardOverviewInvalidationService.test.ts __tests__/localDashboardOverviewInvalidationRoute.test.ts __tests__/localDashboardOverviewService.test.ts __tests__/localDashboardOverviewRoute.test.ts`
  passed: 5 files, 10 tests.

Caveats:

- This slice only migrates the legacy server invalidation helper. The old
  Firebase-backed dashboard overview read/recompute service in
  `lib/services/dashboardOverviewService.ts` still remains for a later slice.
- Final residual search still found 411 matching lines across the requested
  scope. `lib/services/dashboardOverviewInvalidation.server.ts` no longer
  appears; the only touched-file hit is the boundary regex in
  `__tests__/dashboardOverviewInvalidationServerMigration.test.ts`.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and comments; rerun the residual usage search before the
  next slice.

## Slice Notes - 2026-05-25 Hall of Fame Server Compatibility Wrapper

Changed:

- Redirected `lib/services/hallOfFameService.server.ts` away from Firebase Admin
  runtime access.
- Preserved the exported `updateHallOfFame(userId)` server helper as a
  compatibility wrapper while delegating persistence and ranking recalculation to
  the existing Prisma-backed `updateLocalHallOfFame()` service under
  `lib/server/hall-of-fame/localHallOfFameService.ts`.
- Added `__tests__/hallOfFameServerCompatibilityMigration.test.ts` as a
  source-level and delegation regression guard so the legacy helper cannot
  reintroduce Firebase Admin imports.

Verified:

- Red test initially failed while importing the legacy helper because Firebase
  runtime initialization reached `lib/firebase/config.ts` and threw
  `FirebaseError: Firebase: Error (auth/invalid-api-key)`.
- `npm test -- --run __tests__/hallOfFameServerCompatibilityMigration.test.ts`
  passed: 1 file, 2 tests.
- `npm test -- --run __tests__/hallOfFameServerCompatibilityMigration.test.ts __tests__/localHallOfFameService.test.ts __tests__/localHallOfFameRecalculateRoute.test.ts __tests__/localMonthlySnapshotCronService.test.ts __tests__/localManualSnapshotService.test.ts __tests__/hallOfFameTypesFirebaseBoundary.test.ts`
  passed: 6 files, 13 tests.

Remaining:

- `lib/services/hallOfFameService.ts` still remains Firebase-backed on the client
  wrapper path and should be migrated in a later slice.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and comments; rerun the residual usage search before the
  next slice.

## Slice Notes - 2026-05-25 Asset Admin Repository Compatibility Wrapper

Changed:

- Redirected `lib/server/assetAdminRepository.ts` away from Firebase Admin
  runtime access.
- Preserved the exported `getUserAssetsAdmin(userId)` helper as a legacy
  compatibility wrapper while delegating reads to the existing Prisma-backed
  `listLocalAssets()` service under `lib/server/assets/localAssetService.ts`.
- Added `__tests__/assetAdminRepositoryMigration.test.ts` as a source-level and
  delegation regression guard so the legacy helper cannot reintroduce Firebase
  Admin imports.
- Updated `docs/agent-memory.md` so durable project guidance no longer describes
  this helper as a canonical Admin SDK repository.

Verified:

- Red test initially failed for the expected Firebase boundary: the legacy helper
  still imported `@/lib/firebase/admin`, mentioned Firebase Admin SDK, and tried
  to use `adminDb`; the delegation test timed out while reaching the old Admin
  path.
- `npm test -- --run __tests__/assetAdminRepositoryMigration.test.ts` passed: 1
  file, 2 tests.
- `npm test -- --run __tests__/assetAdminRepositoryMigration.test.ts __tests__/localAssetService.test.ts __tests__/localAssetsRoutes.test.ts __tests__/localAssetItemRoute.test.ts __tests__/localPerformanceYieldMetricsService.test.ts __tests__/localAutomatedSnapshotService.test.ts`
  passed: 6 files, 19 tests.

Remaining:

- `lib/server/assetAdminRepository.ts` has no active app/lib/component/test
  callers in the current search scope, so this is mostly a stale compatibility
  boundary cleanup rather than an active-route migration.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and comments; rerun the residual usage search before the
  next slice.

## Slice Notes - 2026-05-25 Auth Helpers Firebase Runtime Boundary

Changed:

- Reworked `lib/utils/authHelpers.ts` from a Firebase client-auth helper into a
  provider-neutral local session timing/retry utility.
- Removed the direct `firebase/auth` runtime import and replaced the SDK-specific
  user type with a small structural `RefreshableSessionUser` boundary.
- Renamed the exported helpers from Firebase/Firestore-specific names to
  `waitForSessionReady()` and `retryPermissionSensitiveOperation()`.
- Updated `contexts/AuthContext.tsx` to call the neutral helper names while
  preserving the existing registration flow.
- Added `__tests__/authHelpersFirebaseBoundary.test.ts` as a source/import
  boundary guard proving the helper no longer imports Firebase runtime modules
  or exposes the old Firestore-named retry API.

Verified:

- Red test initially failed for the expected reasons: the helper file was absent
  after the first over-narrow deletion attempt, and `contexts/AuthContext.tsx`
  still imported the old helper names. Typecheck exposed the active caller, so
  the slice was corrected to a neutral compatibility helper rather than deleting
  the file.
- `npm test -- --run __tests__/authHelpersFirebaseBoundary.test.ts` passed: 1
  file, 2 tests.
- `npm test -- --run __tests__/authHelpersFirebaseBoundary.test.ts __tests__/authFetchLocalSession.test.ts __tests__/localSessionAuth.test.ts __tests__/localAuthService.test.ts __tests__/localAuthRegisterRoute.test.ts`
  passed: 5 files, 19 tests.

Remaining:

- `contexts/AuthContext.tsx` still contains broader Firebase Auth/Firestore
  runtime code outside the original residual search scope and remains a future
  auth-foundation migration target.
- `lib/server/apiAuth.ts` still imports Firebase Admin auth and remains a future
  local auth-foundation compatibility slice.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and comments; rerun the residual usage search before the
  next slice.

## Slice Notes - 2026-05-25 Shared Date Helper Provider Vocabulary Boundary

Changed:

- Renamed the remaining `TimestampLike` structural compatibility type in
  `lib/utils/dateHelpers.ts` to the provider-neutral `ProviderDateLike`.
- Updated active UI imports/usages in `components/dividends/DividendTable.tsx`,
  `components/expenses/ExpenseCard.tsx`, and
  `components/expenses/ExpenseTable.tsx` to use the neutral date helper type.
- Updated date-helper comments and tests from provider-specific timestamp wording
  to provider-neutral date-value wording while preserving duck-typed `toDate()`
  support for legacy serialized values.
- Extended `__tests__/dateHelpers.test.ts` with a source-level guard that checks
  the shared date helper and active UI date-formatting imports do not reintroduce
  the old provider-specific timestamp vocabulary.

Verified:

- Red test failed for the expected reason: `lib/utils/dateHelpers.ts` still
  exported and used the old provider-specific date type name.
- `npm test -- --run __tests__/dateHelpers.test.ts` passed: 1 file, 22 tests.
- `npm test -- --run __tests__/dateHelpers.test.ts __tests__/dividendUiFirebaseBoundary.test.ts __tests__/expenseUiFirebaseBoundary.test.ts __tests__/localDividendsRoutes.test.ts __tests__/localExpenseService.test.ts __tests__/localExpensesRoutes.test.ts`
  passed: 6 files, 54 tests.

Remaining:

- This slice only removes provider-specific date vocabulary from the shared date
  helper and the active dividend/expense UI imports that consumed it.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and comments; rerun the residual usage search before the
  next slice.

## Slice Notes - 2026-05-25 Budget Utility Test Provider Type Boundary

Changed:

- Removed the remaining `import('firebase/firestore').Timestamp` type casts from
  `__tests__/budgetUtils.test.ts` expense fixtures.
- Added a focused source-level boundary assertion to the same test file so the
  pure budget utility regression tests keep using provider-neutral `Date` values.
- Built the forbidden provider/type pattern from fragments so the guard itself
  does not add false-positive residual search hits.

Verified:

- Red test failed for the expected reason: the new budget utility fixture
  boundary detected the old Firebase provider `Timestamp` type casts.
- `npm test -- --run __tests__/budgetUtils.test.ts` passed: 1 file, 19 tests.
- `npm test -- --run __tests__/budgetUtils.test.ts __tests__/budgetTypesFirebaseBoundary.test.ts __tests__/budgetServiceClient.test.ts __tests__/localBudgetRoutes.test.ts __tests__/localBudgetService.test.ts`
  passed: 5 files, 32 tests.
- A focused residual search for `__tests__/budgetUtils.test.ts` found no remaining
  `firebase/firestore` or `Timestamp` hits.

Remaining:

- This slice only removes Firebase provider type coupling from pure budget utility
  fixtures; it does not migrate the larger Firebase-backed runtime services.
- Many Firebase runtime hits remain in services, server code, utilities,
  components, tests, and comments; rerun the residual usage search before the
  next slice.

## Slice Notes - 2026-05-31 Asset Client Wrapper

Changed:

- Redirected `lib/services/assetService.ts` from direct Firebase client SDK calls
  to local authenticated API calls through `/api/assets` and
  `/api/assets/[assetId]` while preserving the legacy wrapper signatures used by
  UI and cashflow code.
- Preserved pure asset calculation helpers in `assetService.ts` and kept the
  wrapper responsible for local dashboard invalidation and household audit
  side effects that previously happened after client-side writes.
- Added `getLocalAssetById(userId, assetId)` to
  `lib/server/assets/localAssetService.ts` and exposed thin `GET`, `PUT`, and
  `DELETE` handlers in `app/api/assets/[assetId]/route.ts`.
- Extended asset route validation for rich asset payloads such as bond details,
  pension fund details, ownership metadata, and EUR price fields.
- Preserved cash-overdraft behaviour by allowing negative quantity updates for
  cash assets through the item `PUT` route while continuing to reject negative
  quantities for non-cash updates and on asset creation.
- Added `__tests__/assetServiceClientMigration.test.ts` to guard that the active
  client wrapper no longer imports Firebase runtime modules and delegates reads,
  creates, updates, price updates, cash balance changes, investment quantity
  changes, and deletes to local API routes.

Verified:

- Red migration test failed before implementation because `assetService.ts` still
  imported `firebase/firestore` and `@/lib/firebase/config` and because wrapper
  calls reached mocked Firestore helpers instead of `authenticatedFetch`.
- Red cash-overdraft route test failed before the validation fix because the item
  `PUT` route returned `400` for a cash asset quantity of `-1`.
- `npm test -- --run __tests__/assetServiceClientMigration.test.ts __tests__/localAssetService.test.ts __tests__/localAssetsRoutes.test.ts __tests__/localAssetItemRoute.test.ts`
  passed: 4 files, 26 tests.
- `npm test -- --run __tests__/localPerformanceYieldMetricsService.test.ts __tests__/localAutomatedSnapshotService.test.ts __tests__/assetAdminRepositoryMigration.test.ts __tests__/assetAllocationServiceClientMigration.test.ts`
  passed: 4 files, 12 tests.
- `npx tsc --noEmit --incremental false` passed.
- Residual usage search was rerun with
  `rg -n "firebase|Firestore|adminDb|Timestamp|requireFirebaseAuth|lib/firebase" app lib components types __tests__`.
  `lib/services/assetService.ts` now has only a legacy comment hit mentioning
  Firestore in the GBp fallback documentation and no Firebase runtime import.

Remaining:

- Active Firebase runtime dependencies still remain outside this slice, notably
  expenses, snapshots, performance, dividends, dashboard overview compatibility
  services, periodic email, assistant legacy store, API auth compatibility,
  dividend processing, and price updater paths. Rerun the residual search before
  selecting the next slice.

## Slice Notes - 2026-05-31 Hall of Fame Client Wrapper

Changed:

- Redirected `lib/services/hallOfFameService.ts` from direct Firebase client SDK
  reads/writes to authenticated local API calls while preserving the existing
  public exports used by the Hall of Fame UI and dashboard refresh path.
- Kept `getNotesForPeriod()` as a pure client-side helper and normalized Hall of
  Fame `updatedAt` plus note timestamps back to `Date` objects after JSON API
  responses.
- Added local Hall of Fame routes:
  - `app/api/hall-of-fame/route.ts` for authenticated reads.
  - `app/api/hall-of-fame/notes/route.ts` for authenticated writable note
    creation.
  - `app/api/hall-of-fame/notes/[noteId]/route.ts` for authenticated writable
    note updates and deletes.
- Extended `lib/server/hall-of-fame/localHallOfFameService.ts` with
  Prisma-backed read and note mutation helpers, preserving existing note
  validation semantics and full-document note-array replacement behaviour.
- Added client wrapper and route migration tests to guard against Firebase
  runtime reintroduction.

Verified:

- Red client-wrapper migration test failed before implementation because
  `hallOfFameService.ts` still imported `firebase/firestore` and
  `@/lib/firebase/config`, and wrapper calls reached mocked Firestore helpers.
- `npm test -- --run __tests__/hallOfFameServiceClientMigration.test.ts __tests__/localHallOfFameService.test.ts __tests__/localHallOfFameRoutes.test.ts __tests__/localHallOfFameRecalculateRoute.test.ts __tests__/hallOfFameServerCompatibilityMigration.test.ts __tests__/hallOfFameTypesFirebaseBoundary.test.ts`
  passed: 6 files, 29 tests.
- `npx tsc --noEmit --incremental false` passed.
- Focused residual search over Hall of Fame service, routes, local server
  service, and tests found no Firebase runtime imports in active Hall of Fame
  code. Remaining hits are boundary-test/mock-only references in Hall of Fame
  tests.

Remaining:

- This slice does not remove remaining Firebase runtime dependencies in other
  active services such as expenses, snapshots, performance, dividends, dashboard
  overview compatibility services, periodic email, assistant legacy store, API
  auth compatibility, dividend processing, and price updater paths.

## Slice Notes - 2026-06-01 Snapshot Client Wrapper

Changed:

- Redirected `lib/services/snapshotService.ts` from direct Firebase client SDK
  reads/writes to authenticated local API calls through `/api/snapshots` while
  preserving the existing public exports used by history, performance, dashboard,
  and snapshot hooks.
- Kept `createSnapshot()` responsible for the existing net-worth, allocation,
  household ownership, and snapshot ID calculations, then persisted the computed
  payload through the local route.
- Kept snapshot reads sorted through the local Prisma-backed snapshot service and
  normalized JSON `createdAt` values back to `Date` objects in the client wrapper.
- Reworked `updateSnapshotNote()` to use the local snapshots API by reading the
  existing month and upserting the same snapshot payload with the updated note.
- Added `__tests__/snapshotServiceClientMigration.test.ts` as a source-level and
  behavior regression guard so the active snapshot wrapper cannot reintroduce
  Firebase runtime imports or Firestore calls.

Verified:

- Red migration test failed before implementation because `snapshotService.ts`
  still imported `firebase/firestore` and `@/lib/firebase/config` and because
  wrapper calls reached mocked Firestore helpers instead of `authenticatedFetch`.
- `npm test -- --run __tests__/snapshotServiceClientMigration.test.ts __tests__/localSnapshotsRoute.test.ts __tests__/localSnapshotService.test.ts __tests__/snapshot-id-format.test.ts`
  passed: 4 files, 25 tests.
- `npm test -- --run __tests__/snapshotServiceClientMigration.test.ts __tests__/localSnapshotsRoute.test.ts __tests__/localSnapshotService.test.ts __tests__/snapshot-id-format.test.ts __tests__/localManualSnapshotRoute.test.ts __tests__/localManualSnapshotService.test.ts __tests__/localAutomatedSnapshotRoute.test.ts __tests__/localAutomatedSnapshotService.test.ts __tests__/performanceService.test.ts`
  passed: 9 files, 108 tests.
- `npx tsc --noEmit --incremental false` passed.
- Focused residual search over `lib/services/snapshotService.ts` found no
  remaining Firebase, Firestore, `Timestamp`, `adminDb`, `requireFirebaseAuth`,
  or `lib/firebase` matches.

Caveats:

- `updateSnapshotNote()` is now a two-call `GET` + `POST` local API flow for
  existing snapshots. If no snapshot row exists for the requested month, it is a
  no-op because the local Postgres snapshot schema requires full monthly metrics
  instead of partial note-only records.

Remaining:

- Active Firebase runtime dependencies still remain outside this slice, notably
  expenses, dummy snapshot/data helpers, performance, dividends, dashboard
  overview compatibility services, periodic email, assistant legacy store, API
  auth compatibility, dividend processing, and price updater paths. Rerun the
  residual search before selecting the next slice.

## Slice Notes - 2026-06-01 Dummy Data Client Wrapper

Changed:

- Redirected `lib/services/dummyDataService.ts` from direct Firebase client SDK
  reads/deletes to a local authenticated `/api/dummy-data` route while preserving
  the legacy exported functions and `DummyDataCount` interface used by
  `DeleteDummyDataDialog`.
- Added `app/api/dummy-data/route.ts`, a thin local-session route for dummy data
  counts and deletes. `GET` requires a local session; `DELETE` also enforces
  `assertWritableUser()` and validates optional `target` query values.
- Added `lib/server/dummy/localDummyDataService.ts` with Prisma-backed,
  user-scoped count/delete helpers. Dummy snapshots use `MonthlySnapshot.isDummy`,
  while dummy expenses and categories use the legacy import ID prefixes
  `dummy-` and `dummy-category-` stored in `legacyFirebaseId`.
- Added client wrapper, route, and server-service regression tests.

Verified:

- Red migration tests failed before implementation because the wrapper still
  imported `firebase/firestore` and `@/lib/firebase/config`, the local route did
  not exist, and the local server service did not exist.
- `npm test -- --run __tests__/dummyDataServiceClientMigration.test.ts __tests__/localDummyDataRoute.test.ts __tests__/localDummyDataService.test.ts`
  passed: 3 files, 20 tests.
- `npm test -- --run __tests__/dummyDataServiceClientMigration.test.ts __tests__/localDummyDataRoute.test.ts __tests__/localDummyDataService.test.ts __tests__/localSnapshotsRoute.test.ts __tests__/localSnapshotService.test.ts __tests__/localExpensesRoutes.test.ts __tests__/localExpenseService.test.ts __tests__/localExpenseCategoriesRoutes.test.ts __tests__/localExpenseCategoryService.test.ts`
  passed: 9 files, 61 tests.
- `npx tsc --noEmit --incremental false` passed.
- Focused residual search over the dummy wrapper, route, server service, and
  dummy tests found no Firebase runtime imports in active dummy code. Remaining
  dummy-slice hits are test-only boundary mocks/assertions.

Caveats:

- Local dummy expense/category cleanup depends on imported legacy dummy markers
  in `legacyFirebaseId`; records without those markers are intentionally not
  counted or deleted by this compatibility slice.
- The wrapper keeps accepting `userId` for legacy signature compatibility but
  ignores it; ownership is now scoped by the server-side local session.

Remaining:

- Active Firebase runtime dependencies still remain outside this slice, notably
  expenses, dummy snapshot generation, performance, dividends, dashboard
  overview compatibility services, periodic email, assistant legacy store, API
  auth compatibility, dividend processing, and price updater paths. Rerun the
  residual search before selecting the next slice.

## Slice Notes - 2026-06-01 Dummy Snapshot Generator Client Wrapper

Changed:

- Redirected `lib/services/dummySnapshotGenerator.ts` from direct Firebase
  client SDK writes to local authenticated API calls while preserving the legacy
  exported `generateDummySnapshots(params)` and
  `generateSingleDummySnapshot(userId, year, month, netWorth)` signatures used by
  existing UI code.
- Snapshot generation now posts dummy monthly snapshots to `/api/snapshots` with
  `isDummy: true` instead of calling Firestore `setDoc`.
- Optional generated cashflow now posts categories to `/api/expense-categories`
  and expenses to `/api/expenses`, carrying deterministic legacy dummy markers
  in `legacyFirebaseId` so the migrated dummy cleanup service can count/delete
  those rows safely.
- Added narrow route/service support for `legacyFirebaseId` on category and
  expense creation. When present, local services use user-scoped Prisma upserts
  on `(userId, legacyFirebaseId)` to preserve idempotent dummy generation without
  exposing caller-supplied database primary keys.
- Added client wrapper regression tests proving the generator has no active
  Firebase runtime imports and delegates snapshot/category/expense creation to
  local APIs.

Verified:

- `npm test -- --run __tests__/dummySnapshotGeneratorClientMigration.test.ts __tests__/localExpenseService.test.ts __tests__/localExpenseCategoryService.test.ts __tests__/localExpensesRoutes.test.ts __tests__/localExpenseCategoriesRoutes.test.ts`
  passed: 5 files, 38 tests.
- `npx tsc --noEmit --incremental false` passed.
- Residual Firebase search found no matches in
  `lib/services/dummySnapshotGenerator.ts`; remaining hits for this slice are
  only the new boundary/regression test mocks and assertions.
- Full residual search count after this slice: 384 matching lines across app,
  lib, components, types, and tests.

Caveats:

- The new expense/category upsert path intentionally uses `legacyFirebaseId` only
  as a scoped idempotency key; existing route-created records without this key
  keep the previous create behavior.
- Generated dummy data is still session-scoped by the local API routes; the
  legacy `userId` parameter remains only to preserve existing wrapper signatures
  and deterministic dummy legacy IDs.

Remaining:

- Active Firebase runtime dependencies still remain outside this slice, notably
  expenses, performance, dividends, dashboard overview compatibility services,
  periodic email, assistant legacy store, API auth compatibility, dividend
  processing, and price updater paths. Rerun the residual search before
  selecting the next slice.

## Slice Notes - 2026-06-01 Expense Service Client Wrapper

Changed:

- Redirected `lib/services/expenseService.ts` from direct Firebase client SDK
  reads/writes/batches to authenticated local API calls while preserving the
  legacy exported function signatures used by cashflow, budget, investment, and
  settings UI code.
- Preserved single, recurring, and installment creation semantics by building
  the series payloads client-side and posting them through `/api/expenses`, with
  local API/session ownership replacing legacy client-supplied user ownership.
- Added local expense item `GET` support under `/api/expenses/[expenseId]` so the
  compatibility wrapper can fetch before update/delete for audit and payload
  reconstruction.
- Extended `/api/expenses` and `lib/server/cashflow/localExpenseService.ts` with
  session-scoped recurring/installment series list and delete helpers.
- Extended `/api/expenses/category-assignment` and the local expense server
  service with category name, subcategory name, and category type cascade
  actions, preserving sign flipping when moving across income/non-income types.
- Added `__tests__/expenseServiceClientMigration.test.ts` as the RED/GREEN
  client-wrapper boundary test covering list/month/date-range/item reads,
  create/update/delete, recurring/installment create/list/delete, category
  cascade helper calls, and no Firebase runtime imports/calls.

Verified:

- Red test failed before implementation because `expenseService.ts` still
  imported `firebase/firestore` and `@/lib/firebase/config` and wrapper calls
  reached the mocked Firestore helpers instead of `authenticatedFetch`.
- `npm test -- --run __tests__/expenseServiceClientMigration.test.ts __tests__/localExpenseService.test.ts __tests__/localExpensesRoutes.test.ts __tests__/expenseCategoryAssignmentMigration.test.ts`
  passed: 4 files, 41 tests.
- `npx tsc --noEmit --incremental false` passed.
- Focused residual search over `lib/services/expenseService.ts` found no
  remaining Firebase, Firestore, `Timestamp`, `adminDb`, `requireFirebaseAuth`,
  or `lib/firebase` matches.
- Full residual search count after this slice: 383 matching lines across app,
  lib, components, types, and tests.

Caveats:

- The wrapper reconstructs update payloads from a local item `GET` plus the
  submitted partial update because the local `PUT` route expects a full expense
  payload. This preserves the public legacy wrapper signature without expanding
  route semantics in this slice.
- Recurring/installment series deletion is now a session-scoped local API delete
  by parent ID; existing callers that need linked cash-asset reversal still read
  the series first through the migrated list helpers.

Remaining:

- Active Firebase runtime dependencies still remain outside this slice, notably
  performance, dividends, dashboard overview compatibility services, periodic
  email, assistant legacy store, API auth compatibility, dividend processing,
  and price updater paths. Rerun the residual search before selecting the next
  slice.

## Slice Notes - 2026-06-01 Performance Cache Local Route/Service

Changed:

- Finished migrating the remaining cache helpers in
  `lib/services/performanceService.ts` from legacy Firestore reads/writes to the
  local authenticated `/api/performance/cache` route.
- Replaced provider-bound cache date serialization (`Timestamp`/`toDate()`) with
  plain ISO-string serialization for cached payloads and explicit ISO-date
  deserialization back to `Date` objects when loading cached metrics.
- Preserved `getAllPerformanceData(userId, forceRefresh?)` public behavior,
  including snapshot-key cache invalidation, 6-hour cache expiry, and non-fatal
  fallback to live recomputation on cache read/write/parse errors.
- Added route and server-service regression coverage into
  `__tests__/performanceServiceClientMigration.test.ts` for:
  - local cache route `GET`/`PUT` success and auth/validation branches
  - local performance cache server-service read/write normalization and merge
    behavior
  - client wrapper serialization/deserialization boundary assertions

Verified:

- `npm test -- --run __tests__/performanceServiceClientMigration.test.ts`
  passed: 1 file, 11 tests.
- `npm test -- --run __tests__/performanceService.test.ts` passed: 1 file,
  68 tests.
- `npx tsc --noEmit --incremental false` passed.
- `git diff --check -- docs/firebase-to-postgres-migration-handoff.md lib/services/performanceService.ts __tests__/performanceServiceClientMigration.test.ts app/api/performance/cache/route.ts lib/server/performance/localPerformanceCacheService.ts`
  passed.

Remaining:

- Active Firebase runtime dependencies still remain outside this slice, notably
  dividends, dashboard overview compatibility services, periodic email,
  assistant legacy store, API auth compatibility, dividend processing, and price
  updater paths. Rerun the residual search before selecting the next slice.

## Known Residual Firebase Runtime Areas

The next agent should continue by reducing these remaining Firebase-dependent
paths. Do not assume this list is exhaustive; run `rg` before each slice.

High-value next targets:

- `lib/services/dashboardOverviewService.ts`
- `lib/services/dividendService.ts`
- `lib/services/dividendIncomeService.ts`
- `lib/server/dividendUseCase.ts`
- `lib/server/dividendProcessor.ts`
- `lib/server/monthlyEmailService.ts`
- `lib/helpers/priceUpdater.ts`
- `lib/server/assistant/store.ts`
- `lib/server/apiAuth.ts`
- `contexts/AuthContext.tsx` (outside the standard residual search scope but
  still Firebase-backed until auth foundation is fully migrated)
- shared type/date helper aliases and boundary-test patterns that still include
  `Timestamp` in their names or regexes

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

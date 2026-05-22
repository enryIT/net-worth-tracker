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

- `lib/services/expenseService.ts` is still Firebase-backed and is still used by
  category reassignment/count/move UI paths; migrate it in a separate narrow
  slice instead of broadening this wrapper slice.
- Many Firebase runtime hits remain in other services and shared/client types;
  rerun the residual usage search before the next slice.

## Known Residual Firebase Runtime Areas

The next agent should continue by reducing these remaining Firebase-dependent
paths. Do not assume this list is exhaustive; run `rg` before each slice.

High-value next targets:

- `lib/services/assetService.ts`
- `lib/services/assetAllocationService.ts`
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

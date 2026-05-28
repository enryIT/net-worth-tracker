# Merge Audit: upstream/main -> merge/upstream-gdm98-main-2026-05-28

Date: 2026-05-28
Target branch: `merge/upstream-gdm98-main-2026-05-28`
Base SHA (`HEAD` before merge): `7920deafd3a73b3cb57bf3244642a99940b15452`
Upstream SHA (`upstream/main`): `ce81e5ac0f43d9318338b48d55606cae6c5a9e33`

## Merge execution notes

1. Codex first attempted the requested command inside its workspace sandbox:
   - `git merge --no-ff --no-commit upstream/main`
   - Sandbox result: failed to write merge metadata (`ORIG_HEAD.lock`) because the sandbox could not write the external `.git` metadata path.
2. Codex resolved the tree file-by-file and produced this audit draft.
3. Hermes then reconciled the Codex-resolved tree into a real Git merge state outside the Codex sandbox:
   - backed up the Codex-resolved files;
   - reset the branch to `origin/main`;
   - ran `git merge --no-ff --no-commit upstream/main` in the real clone;
   - restored the Codex-resolved files;
   - staged exact resolved paths only.
4. Current verified merge metadata:
   - `HEAD`: `7920deafd3a73b3cb57bf3244642a99940b15452`
   - `.git/MERGE_HEAD`: `ce81e5ac0f43d9318338b48d55606cae6c5a9e33`
   - unresolved paths: `0`

## Upstream commits integrated

1. `2b6345c` fix(audit): Analisi + Patrimonio quality pass — tokens, a11y, perf, breakpoints
2. `5f3a2ba` fix(dividends): quality pass — theming, ARIA, 2-click delete, shared constants
3. `2562180` fix(cashflow): theming + a11y quality pass on Tracciamento tab and ExpenseDialog
4. `b15d390` fix(budget): a11y + theming quality pass on BudgetTab
5. `fc901e9` fix(cost-centers): a11y + theming quality pass on CostCenters tab
6. `d0b9b4d` fix(allocation): a11y + theming quality pass on Allocation page
7. `ce81e5a` merge PR #140 from upstream develop

## Conflict resolution matrix

| File | Resolution | Type |
|---|---|---|
| `AGENTS.md` | Kept enryIT local Caliber/skills/non-negotiables entrypoint format intentionally. Path was marked resolved with local content. | intentionally-local-different |
| `CLAUDE.md` | Kept enryIT short entrypoint format intentionally. Path was marked resolved with local content. | intentionally-local-different |
| `Draft Release Temp.md` | Merged as union because the owner explicitly requested upstream changes be integrated despite the usual protected-file rule. | hybrid |
| `app/dashboard/allocation/page.tsx` | Combined household-scope import (`filterAssetsByOwnershipScope`) with upstream `ActionChip` usage and keyboard/a11y row handling. | hybrid |
| `components/cashflow/ExpenseTrackingTab.tsx` | Preserved unified movement architecture and local investment/transfer flow; integrated upstream semantic color/a11y filter changes. | hybrid |
| `components/dividends/DividendTrackingTab.tsx` | Combined household scope/filter support with upstream shared dividend constants and scrape confirmation/theming changes. | hybrid |

No product-owner decision point remained open after the user confirmed `Draft Release Temp.md` should be integrated.

## Upstream-touched files: final classification

| File | Classification |
|---|---|
| `AGENTS.md` | intentionally-local-different |
| `CLAUDE.md` | intentionally-local-different |
| `Draft Release Temp.md` | hybrid |
| `__tests__/allocationUtils.test.ts` | identical-to-upstream |
| `app/dashboard/allocation/page.tsx` | hybrid |
| `app/dashboard/assets/page.tsx` | hybrid |
| `components/allocation/AllocationCard.tsx` | identical-to-upstream |
| `components/allocation/AllocationPageSkeleton.tsx` | identical-to-upstream |
| `components/assets/AssetCard.tsx` | hybrid |
| `components/assets/AssetDialog.tsx` | hybrid |
| `components/assets/AssetManagementTab.tsx` | hybrid |
| `components/assets/AssetMobileSummary.tsx` | identical-to-upstream |
| `components/assets/AssetSparkline.tsx` | identical-to-upstream |
| `components/cashflow/AnalisiTab.tsx` | identical-to-upstream |
| `components/cashflow/BudgetTab.tsx` | hybrid |
| `components/cashflow/CashflowSankeyChart.tsx` | identical-to-upstream |
| `components/cashflow/CostCenterDetail.tsx` | identical-to-upstream |
| `components/cashflow/CostCenterDialog.tsx` | identical-to-upstream |
| `components/cashflow/CostCentersTab.tsx` | identical-to-upstream |
| `components/cashflow/ExpenseTrackingTab.tsx` | hybrid |
| `components/dividends/CalendarDayCell.tsx` | identical-to-upstream |
| `components/dividends/DividendCalendar.tsx` | identical-to-upstream |
| `components/dividends/DividendDetailsDialog.tsx` | identical-to-upstream |
| `components/dividends/DividendStats.tsx` | hybrid |
| `components/dividends/DividendTable.tsx` | identical-to-upstream |
| `components/dividends/DividendTrackingTab.tsx` | hybrid |
| `components/expenses/ExpenseDialog.tsx` | hybrid |
| `docs/audit-prompts.md` | identical-to-upstream |
| `docs/critique-prompts.md` | identical-to-upstream |
| `lib/constants/dividendTypes.ts` | identical-to-upstream |
| `types/costCenters.ts` | identical-to-upstream |

## Local features explicitly preserved

- Household scope filtering/selectors in allocation, assets, cashflow, and dividends surfaces.
- Unified cashflow movement workflow (`ordinary`, `investment`, `transfer`) in `ExpenseTrackingTab.tsx`.
- Investment and internal-transfer edit/save/delete behavior and associated routing through `investmentOperationService`.
- Roomy unified movement dialog layout (`desktop:max-w-4xl`) for investment and transfer forms.
- Local agent/Caliber operating guidance in `AGENTS.md` and short `CLAUDE.md` entrypoint model.
- Existing enryIT additions in merged UI files where upstream and local changes overlapped.

## Verification commands and results

Executed after Hermes reconciled the real merge state:

- `git grep -n '^<<<<<<< \|^=======\|^>>>>>>> ' -- . || true`
  - Result: no conflict markers.
- `git diff --check`
  - Result: passed.
- `npm ci`
  - Result: installed 965 packages; npm reported 8 moderate vulnerabilities. No audit fix was applied because dependency remediation is outside this merge scope.
- `npm test -- --run __tests__/allocationUtils.test.ts`
  - Result: passed, 30 tests.
- `npm test -- --run __tests__/budgetUtils.test.ts`
  - Result: passed, 18 tests.
- `npm test -- --run __tests__/cashflowUnifiedMovementForm.test.ts __tests__/cashflowTrackingUnification.test.ts __tests__/cashflowUiRegression.test.ts __tests__/investmentOperationService.test.ts`
  - Result: passed, 4 files / 30 tests.
- `npx tsc --noEmit`
  - Result: passed.
- `npm test`
  - Result: passed, 38 files / 595 tests.
- `npm run build`
  - First run without Firebase client env failed during page-data collection for `/api/cron/monthly-snapshot` with `Firebase: Error (auth/invalid-api-key)`, after successful compile and TypeScript.
- `NEXT_PUBLIC_FIREBASE_API_KEY='***' NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN='build-....com' NEXT_PUBLIC_FIREBASE_PROJECT_ID='build-placeholder' NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET='build-placeholder.appspot.com' NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID='1234567890' NEXT_PUBLIC_FIREBASE_APP_ID='1:1234567890:web:abcdef123456' npm run build`
  - Result: passed. Next.js compiled successfully, TypeScript finished, 46 static pages generated, route manifest emitted.

## Additional semantic checks

- `git grep -n 'lg:' -- <touched UI paths>`
  - Result: no `lg:` breakpoint found in touched UI paths.
- Feature marker check confirmed local preservation of:
  - `HouseholdScopeSelect`
  - `filterAssetsByOwnershipScope`
  - `filterDividendsByOwnershipScope`
  - `InvestmentOperation`
  - `InternalTransfer`
  - `Nuovo movimento` / `Modifica movimento`
  - `desktop:max-w-4xl`
  - shared upstream `dividendTypeLabels`

## Current pre-commit merge correctness checks

- `.git/MERGE_HEAD` exists and equals `ce81e5ac0f43d9318338b48d55606cae6c5a9e33`.
- `git diff --name-only --diff-filter=U` returns 0 paths.
- `HEAD` remains `7920deafd3a73b3cb57bf3244642a99940b15452` until the merge commit is created.

After committing, the following must be true:

```bash
git merge-base --is-ancestor upstream/main HEAD
git rev-list --left-right --count HEAD...upstream/main
```

The second command should end with right-side `0`.

## Remaining risks

1. The first plain `npm run build` fails without Firebase client env vars; a second build with non-secret placeholder Firebase client env vars passes. Production still needs real Firebase env values.
2. `Draft Release Temp.md` was intentionally merged as a union to preserve both local and upstream release-note content; editorial deduping may still be desirable.
3. No browser/E2E pass was run; verification is source-level, unit-level, type-level, full Vitest-suite-level, and production-build-level with placeholder env.

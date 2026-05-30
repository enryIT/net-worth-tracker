# Merge Audit: upstream/main -> merge/upstream-gdm98-main-2026-05-30 (2026-05-30)

## Scope
Manual resolution audit for merging `upstream/main` (`c229d39`) into local branch `merge/upstream-gdm98-main-2026-05-30`, preserving enryIT fork features while integrating upstream changes.

## Execution Notes
- Codex first resolved the merge in a writable clone after its sandbox could not write `.git/*` metadata in the primary workspace (`ORIG_HEAD.lock`).
- Hermes then reconciled that resolved tree back into a real merge state in this repository:
  - backed up the resolved files,
  - reset the branch to `origin/main`,
  - ran `git merge --no-ff --no-commit upstream/main`,
  - restored the reviewed resolved files,
  - staged only the exact merge/audit paths.
- Real merge command executed in the final repository state:
  - `git merge --no-ff --no-commit upstream/main`
- Conflict set produced by Git:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `app/dashboard/history/page.tsx`

## Resolution Matrix
| File | Type | Resolution | Local feature preservation | Upstream integration |
|---|---|---|---|---|
| `AGENTS.md` | Conflict | Kept local concise operational entrypoint; added explicit Caliber-managed guardrail line. | Preserved all repo-local skill index, non-negotiables, and Caliber workflow references. | Added `Keep Caliber-managed sections in AGENTS.md intact.` |
| `CLAUDE.md` | Conflict | Kept local short entrypoint structure; merged upstream status relevance as one line. | Preserved local architecture/rules summary and docs-first status workflow. | Added note that 2026-05-30 upstream merge includes asset cache invalidation + Storico/Rendimenti quality-pass updates. |
| `README.md` | Conflict | Merged performance bullets semantically. | Preserved existing feature list and local fork capabilities. | Kept upstream wording for theme-aware heatmap/tooltip behavior and rolling CAGR/Sharpe chart details. |
| `app/dashboard/history/page.tsx` | Conflict + overlap | Combined local household-scope pipeline with upstream memoization/a11y/theming improvements. | Preserved household filtering (`displayAssets/displayExpenses/displaySnapshots`) and local domain behavior. | Applied upstream `useMemo` optimizations, popover a11y improvements, token-based colors, table header scope attributes, mobile legends, and progressbar semantics. |
| `Draft Release Temp.md` | Auto-merged overlap | Accepted union/manual integration from merge result (authorized file). | Preserved existing local release notes. | Added upstream bugfix/improvement release-note entries. |
| `app/dashboard/assets/page.tsx` | Auto-merge | Kept local flow; integrated cache invalidation fix. | Preserved household scope and local page behavior. | Added `queryKeys.dashboard.overview` invalidation in dialog-close flow. |
| `components/assets/AssetManagementTab.tsx` | Auto-merge | Kept local tab logic; integrated cache invalidation fix. | Preserved local table/sorting/snapshot behavior. | Added `queryKeys.dashboard.overview` invalidation after asset dialog close. |
| `app/dashboard/performance/page.tsx` | Auto-merge | Retained local structure and behavior; integrated accessibility/theming updates. | Preserved local period/state logic and Italian UI copy. | Added SR live-region for custom period and tokenized AI button hover accent. |
| `app/globals.css` | Auto-merge | Integrated upstream semantic tokens. | Preserved existing theme system and warning token mapping. | Added `--positive*` and `--ai-accent` semantic token definitions. |
| `lib/utils/metricColors.ts` | New upstream file | Added shared metric color utility. | No local feature loss. | Centralized positive/negative metric coloring logic with semantic tokens. |
| `components/performance/HeroMetricBlock.tsx` | Auto-merge | Switched to shared metric color helper. | Preserved animated metric behavior. | Replaced hardcoded green/red classes with semantic token helper. |
| `components/performance/MetricCard.tsx` | Auto-merge | Switched to shared metric color helper. | Preserved card layout and motion behavior. | Replaced hardcoded green/red classes with semantic token helper. |
| `components/performance/BenchmarkComparisonChart.tsx` | Auto-merge | Integrated theme/a11y refinements while keeping benchmark logic. | Preserved benchmark math/table content and local flow. | Theme-aware portfolio line color, semantic text colors, tooltip label fix, table `scope` attributes. |
| `components/performance/BenchmarkComparisonSection.tsx` | Auto-merge | Tokenized warning text color. | Preserved conversion UX and control behavior. | Replaced hardcoded red class with `text-destructive`. |
| `components/performance/MonthlyReturnsHeatmap.tsx` | Auto-merge | Integrated token/a11y improvements. | Preserved heatmap data mapping and layout. | Zero-return cell now uses `bg-muted`; table header/cell semantics improved (`scope`). |
| `components/dashboard/LaborMetricsChart.tsx` | Auto-merge | Integrated mobile legend + token-friendly rendering. | Preserved metric series and chart semantics. | Added mobile legend chips and cleaned themed tooltip/container rendering. |
| `components/history/DoublingMilestoneTimeline.tsx` | Auto-merge | Integrated theme-token + accessibility improvements. | Preserved milestone logic and confetti behavior. | Token-based colors, module-level helper extraction, progressbar ARIA semantics, reduced hardcoded gray/blue classes. |

## Preservation Checks
- Verified no deletion of repo-local `.agents/*` or `.claude/*` skill assets.
- Verified local household/unified-cashflow markers still present:
  - `HouseholdScopeSelect`
  - `filterAssetsByOwnershipScope`
  - `filterDividendsByOwnershipScope`
  - `InvestmentOperation`
  - `InternalTransfer`
  - `Nuovo movimento` / `Modifica movimento`
  - `desktop:max-w-4xl`
  - `dividendTypeLabels`

## Validation Performed
- Conflict marker scan on resolved files: no markers found.
- `npm test -- --run __tests__/chartService.test.ts __tests__/performanceService.test.ts __tests__/assetsPageScopeBoundary.test.ts __tests__/householdFeatureRegression.test.ts __tests__/dashboardOverviewService.test.ts`
  - Result: 5 files passed, 82 tests passed.
- `npx tsc --noEmit`
  - Result: passed.
- `git diff --check`
  - Result: passed.
- `npm run build`
  - Result: failed due network-restricted font fetch (`Geist`/`Geist Mono` from Google Fonts), not due TypeScript/test regressions.

## Commands Run (Merge/Audit Critical Path)
- `git status --short --branch`
- `sed -n '1,220p' docs/plans/merge-upstream-gdm98-main-2026-05-30.md`
- `git merge --no-ff --no-commit upstream/main` (attempt in workspace; blocked by read-only `.git`)
- Writable clone fallback:
  - `git clone /root/repos/net-worth-tracker /tmp/net-worth-tracker-merge-Rumf0h`
  - `git -C /tmp/net-worth-tracker-merge-Rumf0h fetch origin refs/remotes/upstream/main:refs/remotes/upstream/main`
  - `git -C /tmp/net-worth-tracker-merge-Rumf0h merge --no-ff --no-commit upstream/main`
- Conflict review and manual resolution with `sed`, `nl`, `git show :2:...`, `git show :3:...`
- Validation and preservation checks with `rg`, `git diff --cached --stat`, `git diff --cached`
- Synced resolved files back to workspace with `cp`
- Targeted validation commands listed in previous section.

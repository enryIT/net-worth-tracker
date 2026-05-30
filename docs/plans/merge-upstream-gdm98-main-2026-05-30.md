# Plan: merge upstream GiuseppeDM98/main into enryIT/main

## Approach

Create a dedicated merge branch from `origin/main`, merge the true upstream remote `GiuseppeDM98/net-worth-tracker:main` with a real Git merge commit, and resolve conflicts semantically: preserve all enryIT custom features while integrating the 4 upstream commits now missing from the fork. Use Codex for conflict-resolution implementation, then independently verify the result before pushing and creating a PR against `enryIT/net-worth-tracker:main`.

## Verified refs

- Target fork remote: `origin` = `git@github.com:enryIT/net-worth-tracker.git`
- Source upstream remote: `upstream` = `git@github.com:GiuseppeDM98/net-worth-tracker.git`
- Base branch for dedicated work: `origin/main` at `6efe4f9`
- Upstream branch to merge: `upstream/main` at `c229d39`
- Merge-base: `ce81e5ac0f43d9318338b48d55606cae6c5a9e33`
- Divergence after fetch: `origin/main...upstream/main` = `65 4` (fork has 65 unique commits, upstream has 4 unique commits)
- Working branch: `merge/upstream-gdm98-main-2026-05-30`

## Upstream commits to integrate

- `c229d39` Merge pull request #141 from GiuseppeDM98/develop
- `6d92226` fix(patrimonio): invalidate dashboard.overview cache after asset edit
- `7b9ada4` fix(storico): a11y + theming + performance quality pass on History page
- `ef7f42e` fix(rendimenti): a11y + theming quality pass on Performance page

## Scope

### In

- Real `git merge --no-ff --no-commit upstream/main` into the dedicated branch.
- Semantically merge conflicts and overlapping changes in:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `Draft Release Temp.md` (explicitly authorized exception: union/manual integration)
  - `README.md`
  - `app/dashboard/assets/page.tsx`
  - `app/dashboard/history/page.tsx`
  - `app/dashboard/performance/page.tsx`
  - `components/assets/AssetManagementTab.tsx`
- Integrate upstream-only quality changes in:
  - `app/globals.css`
  - `components/dashboard/LaborMetricsChart.tsx`
  - `components/history/DoublingMilestoneTimeline.tsx`
  - `components/performance/BenchmarkComparisonChart.tsx`
  - `components/performance/BenchmarkComparisonSection.tsx`
  - `components/performance/HeroMetricBlock.tsx`
  - `components/performance/MetricCard.tsx`
  - `components/performance/MonthlyReturnsHeatmap.tsx`
  - `lib/utils/metricColors.ts`
- Preserve enryIT additions from the fork, especially household scope, unified cashflow movements, local agent/Caliber docs, repo-local skills, Italian user-facing text, `desktop:` breakpoint convention, and local Firebase-to-Postgres migration assets.
- Produce an audit file documenting each conflict/overlap resolution.
- Push to `origin` and open a PR with base `enryIT:main` only.

### Out

- No merge into `GiuseppeDM98/net-worth-tracker:main`.
- No unrelated refactor, redesign, dependency upgrade, or vulnerability remediation.
- No `git add .`.
- No force-push.
- No deletion of repo-local `.agents/skills` / `.claude/skills` simply because upstream lacks them.

## Action Items

- [x] Load `concise-planning`, `git-advanced-workflows`, `codex`, `create-pr`, and repo-local skills relevant to React/Next.js frontend and pre-push auditing.
- [x] Fetch `origin/main` and `upstream/main`, verify remotes and divergence.
- [x] Ask for owner decision on `Draft Release Temp.md` because project rules normally forbid touching it and upstream modifies it.
- [x] Create branch `merge/upstream-gdm98-main-2026-05-30` from `origin/main`.
- [ ] Run a real `git merge --no-ff --no-commit upstream/main`.
- [ ] Resolve conflicts file-by-file; prefer upstream quality/a11y/theming/performance changes while reapplying local enryIT domain additions.
- [ ] Create `docs/merge-audits/upstream-gdm98-main-2026-05-30.md` with a resolution matrix.
- [ ] Verify no conflict markers, no accidental local feature loss, and both ancestry edges (`origin/main` and `upstream/main`) are present.
- [ ] Run targeted tests for affected assets/history/performance areas, then full `npm test`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
- [ ] Commit the merge, push the branch to `origin`, and create a PR targeting `enryIT/net-worth-tracker:main`.

## Validation checklist

- `git grep -n '^<<<<<<< \|^=======\|^>>>>>>> ' -- .` returns no matches.
- `git merge-base --is-ancestor origin/main HEAD` succeeds.
- `git merge-base --is-ancestor upstream/main HEAD` succeeds.
- Local feature markers still exist: `HouseholdScopeSelect`, `filterAssetsByOwnershipScope`, `filterDividendsByOwnershipScope`, `InvestmentOperation`, `InternalTransfer`, `Nuovo movimento`, `Modifica movimento`, `desktop:max-w-4xl`, `dividendTypeLabels`.
- No introduced `lg:` breakpoint in touched UI files.
- Targeted tests pass for assets/history/performance/cashflow preservation.
- Full tests, TypeScript, build, and whitespace checks pass before PR creation.

## Stop gates

- Stop and ask Enrico before choosing if a conflict would drop either an upstream behavior change or an enryIT feature.
- Stop if `git status` shows unexpected unrelated local modifications.
- Stop if tests fail in a way that requires product behavior decisions rather than straightforward merge repair.
- Stop if GitHub auth or PR creation targets anything other than `enryIT/net-worth-tracker`.

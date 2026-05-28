# Merge plan: upstream GiuseppeDM98/main into enryIT/main

Date: 2026-05-28
Branch: `merge/upstream-gdm98-main-2026-05-28`
Base branch: `origin/main` (`7920deafd3a73b3cb57bf3244642a99940b15452`)
Upstream target: `upstream/main` (`ce81e5ac0f43d9318338b48d55606cae6c5a9e33`)
Initial divergence: `git rev-list --left-right --count origin/main...upstream/main` = `63 7`.

## Objective

Create a real Git merge of all 7 upstream commits into the customized enryIT branch, preserving all local additions and custom behavior. Resolve conflicts intelligently and file-by-file. Do not hide omissions behind `ours`/`theirs` bulk choices.

## Upstream commits to integrate

1. `2b6345c` `fix(audit): Analisi + Patrimonio quality pass — tokens, a11y, perf, breakpoints`
2. `5f3a2ba` `fix(dividends): quality pass — theming, ARIA, 2-click delete, shared constants`
3. `2562180` `fix(cashflow): theming + a11y quality pass on Tracciamento tab and ExpenseDialog`
4. `b15d390` `fix(budget): a11y + theming quality pass on BudgetTab`
5. `fc901e9` `fix(cost-centers): a11y + theming quality pass on CostCenters tab`
6. `d0b9b4d` `fix(allocation): a11y + theming quality pass on Allocation page`
7. `ce81e5a` merge PR #140 from upstream develop

## Hard constraints

- Run a real merge: `git merge --no-ff --no-commit upstream/main`.
- Do not use global/bulk `git checkout --ours .`, `git checkout --theirs .`, `git merge -X ours`, or `git merge -X theirs`.
- User confirmed upstream changes to `Draft Release Temp.md` should be integrated.
- Still do not touch `Temp.md` unless it unexpectedly appears in the merge state; if it does, stop and report.
- Preserve Italian user-facing text and English-only code comments.
- Preserve `desktop:` Tailwind breakpoint; do not introduce `lg:`.
- Preserve project-local additions: household scope, unified cashflow movements, investment operations, internal transfers, cost centers, assistant context, local agent skills/docs, and any route auth guards.
- Do not reintroduce always-visible special-operation forms in Cashflow. Investment operations and internal transfers must stay inside the unified movement flow in `ExpenseTrackingTab.tsx` / `ExpenseDialog.tsx`.
- Do not remove `.agents/skills` or `.claude/skills` tracked in enryIT unless upstream explicitly changed the same file and the resolution is documented.
- If a conflict requires product-owner judgment, stop and document the question instead of guessing.

## Predicted conflict/high-risk files

- `AGENTS.md`
- `CLAUDE.md`
- `Draft Release Temp.md`
- `app/dashboard/allocation/page.tsx`
- `app/dashboard/assets/page.tsx`
- `components/assets/AssetCard.tsx`
- `components/assets/AssetDialog.tsx`
- `components/assets/AssetManagementTab.tsx`
- `components/cashflow/BudgetTab.tsx`
- `components/cashflow/ExpenseTrackingTab.tsx`
- `components/dividends/DividendStats.tsx`
- `components/dividends/DividendTrackingTab.tsx`
- `components/expenses/ExpenseDialog.tsx`

## Upstream-only/new files to include

- `__tests__/allocationUtils.test.ts`
- `lib/constants/dividendTypes.ts`

## File-family resolution guidance

### Docs / agent config

Integrate upstream notes while preserving enryIT's current Caliber/agent guidance, local skills index, project status, and non-negotiables.

### Assets / Patrimonio

Use upstream a11y/theming/perf improvements, but preserve local features:

- household scope/filter support;
- owner/proprietà display;
- historical table behavior;
- existing formatting helpers;
- `desktop:` breakpoint convention.

### Allocation

Integrate upstream quality pass and `allocationUtils` test. Preserve household scope and current allocation-target behavior.

### Cashflow / Budget / Cost centers

Integrate upstream theming/a11y quality pass. Preserve unified movement workflow, guarded investment edit behavior, refresh-before-close, invalid-submit feedback in Italian, roomy investment/transfer dialog layout, and query invalidations.

### Dividends

Integrate upstream shared dividend type constants, theming, ARIA, and two-click delete improvements. Preserve local realized investment summary and any custom stats behavior.

## Required audit output

Create or update `docs/merge-audits/upstream-gdm98-main-2026-05-28.md` with:

- exact SHAs;
- upstream commit list;
- all conflict files and chosen resolution;
- all upstream-touched files and whether they are identical to upstream, hybrid, or intentionally local-different;
- local features explicitly preserved;
- checks run and results;
- blockers/questions if any.

## Verification commands

Run at least:

```bash
git status --short --branch
git grep -n "<<<<<<<\|=======\|>>>>>>>" -- . || true
git diff --check
npm test -- --run __tests__/allocationUtils.test.ts
npm test -- --run __tests__/cashflowUnifiedMovementForm.test.ts __tests__/cashflowTrackingUnification.test.ts __tests__/cashflowUiRegression.test.ts __tests__/investmentOperationService.test.ts
npm test -- --run __tests__/budgetUtils.test.ts
npx tsc --noEmit
```

If time permits and targeted checks pass, also run:

```bash
npm test
npm run build
```

## Final merge correctness checks

Before reporting completion:

```bash
git merge-base --is-ancestor upstream/main HEAD && echo upstream-ancestor-yes || echo upstream-ancestor-no
git rev-list --left-right --count HEAD...upstream/main
git diff --name-status upstream/main..HEAD
```

The second count must end in `0` on the right side after a completed merge commit. Before commit, while still in merge state, document expected pending state instead.

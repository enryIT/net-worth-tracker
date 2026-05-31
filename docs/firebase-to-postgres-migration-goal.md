/goal Complete the Net Worth Tracker migration from Firebase runtime dependencies to a local/self-hosted PostgreSQL + Prisma architecture.

You are continuing an in-progress migration. Do not restart from scratch. Your job is to finish the migration safely, using the work already present on the branch when it is correct, and replacing or repairing it only when tests, architecture, or runtime evidence show it is wrong.

## Final completion condition

The goal is complete only when all of the following are true:

1. The application no longer requires Firebase at runtime for active app behaviour.
2. All active server routes and services that previously depended on Firebase runtime access now use local PostgreSQL/Prisma-backed services.
3. Migrated server routes use local session/auth helpers instead of Firebase auth.
4. Active client-side wrappers no longer call Firebase directly and instead use local API routes where appropriate.
5. Shared runtime types no longer require `firebase/firestore` `Timestamp` or other Firebase runtime imports.
6. Existing behaviour is preserved, including Italian user-facing text.
7. Tests covering the migrated areas pass.
8. TypeScript passes with:

```bash
npx tsc --noEmit --incremental false
```

9. A final Firebase runtime usage search has been run and every remaining match is either removed or explicitly classified as non-runtime, test-only, documentation-only, legacy-only, or intentionally retained with a clear reason.
10. `docs/firebase-to-postgres-migration-handoff.md` is updated with final status, verification evidence, remaining non-runtime Firebase references if any, caveats, and blockers if any.
11. Every committed change is focused, verified, and pushed to:

```bash
origin/handoff/firebase-to-postgres-local-runtime
```

Do not declare the goal complete until the final verification proves it.

## Repository and branch rules

Start from the existing migration branch:

```bash
git fetch origin
git checkout handoff/firebase-to-postgres-local-runtime
```

Do not work from `main`.

Do not merge into `main`.

Continue with focused commits only on this branch.

Push only to:

```bash
origin/handoff/firebase-to-postgres-local-runtime
```

Do not use `git add .`.

Stage only the exact files required for each completed slice.

Before every commit, inspect the staged diff carefully.

## Forbidden files

Do not touch, stage, commit, or push these files:

* `.firebaserc`
* `DOCKER.md`
* `docker-compose.yml`
* `Draft Release Temp.md`
* `Temp.md`

If any of these files appear modified locally, leave them alone and mention them in the status report. Do not stage them.

## Initial setup

Run:

```bash
npm install
npx prisma generate
npx tsc --noEmit --incremental false
```

If setup fails, diagnose the failure. Fix only repository issues that are clearly part of the migration. Do not make unrelated environment or dependency rewrites.

## Read first

Read these files before coding, in this order:

1. `AGENTS.md`
2. `docs/firebase-to-postgres-migration-design.md`
3. `docs/firebase-to-postgres-migration-handoff.md`

Treat `docs/firebase-to-postgres-migration-handoff.md` as the current migration state. The design document is background context, not permission to restart the migration.

## Required skills/workflows

Before coding, announce which skills/workflows you are using:

* `react-nextjs-development`
* `backend-dev-guidelines`
* `test-driven-development`

Also search these locations and announce any relevant matching skill for the selected slice:

```bash
find /root/.agents/skills -maxdepth 3 -type f -o -type d
find .agents/skills -maxdepth 3 -type f -o -type d
```

Examples of repo-local skills that may be relevant:

* `api-auth-routes`
* `vitest-route-testing`
* `assistant-streaming`
* `dividend-and-snapshot-workflows`

If you decide not to use a relevant requested skill/workflow, pause and explain why before continuing.

## Existing work policy

There is already migration work on the branch. Do not discard it by default.

Use existing work when:

* it follows the documented architecture;
* tests pass or can be made to pass with narrow fixes;
* it already uses Prisma/local services correctly;
* it preserves behaviour;
* it fits the backend layering rules.

Repair existing work when:

* it is partially correct but incomplete;
* tests reveal a missing edge case;
* a route is thin but calls the wrong helper;
* a service exists but a client wrapper still bypasses it.

Replace existing work only when there is clear evidence that it is architecturally wrong, untestable, unsafe, or still Firebase-dependent in a way that cannot be corrected cleanly.

Document any replacement decision in `docs/firebase-to-postgres-migration-handoff.md`.

## Discovery phase

Start by running:

```bash
rg -n "firebase|Firestore|adminDb|Timestamp|requireFirebaseAuth|lib/firebase" app lib components types __tests__
```

Then classify every match as one of:

* active runtime dependency;
* active client dependency;
* shared type dependency;
* server-side migration target;
* test-only reference;
* mock-only reference;
* documentation-only reference;
* legacy/dead code candidate;
* false positive.

Prioritise active runtime dependencies first.

Known high-risk areas may include:

* `lib/services/expenseCategoryService.ts`
* `lib/services/snapshotService.ts`
* `lib/services/performanceService.ts`
* `lib/services/dividendService.ts`
* `lib/services/dividendIncomeService.ts`
* `lib/server/dividendUseCase.ts`
* shared types importing `firebase/firestore` `Timestamp`
* active UI/service wrappers still importing Firebase

Do not assume this list is complete. Use the search results as the source of truth.

## Autonomous execution loop

Work in repeated narrow vertical slices until the final completion condition is met.

For each slice:

1. Select one coherent migration target.
2. State the selected slice before coding.
3. Identify the current Firebase dependency and the intended local PostgreSQL/Prisma replacement.
4. Check whether a local API route, server service, use-case, or test already exists.
5. Write a failing regression test first whenever feasible.
6. Run the targeted red test and confirm it fails for the expected reason.
7. Implement the smallest code change needed.
8. Run the targeted green test.
9. Run broader relevant tests for the touched area.
10. Run TypeScript.
11. Run a Firebase usage search again for the touched area.
12. Update `docs/firebase-to-postgres-migration-handoff.md`.
13. Check whitespace and diffs only for touched files.
14. Stage only exact touched files needed for the slice.
15. Commit the verified slice.
16. Push the commit.
17. Continue to the next remaining Firebase runtime dependency.

Do not stop after one slice unless:

* the full migration is complete;
* there is a real blocker;
* token/tool budget prevents safe continuation;
* the repository is in a state where continuing would risk damage.

If you stop before completion, document exactly what remains and why.

## Backend architecture rules

App Router route handlers must stay thin.

Allowed in route handlers:

* auth/session checks;
* input parsing;
* validation;
* demo guards;
* response mapping;
* calling server services/use-cases.

Not allowed in route handlers:

* large business logic;
* direct Prisma queries for migrated business workflows;
* Firebase runtime access;
* broad data transformation that belongs in services.

Business logic must live in `lib/server/*` services or use-cases.

Prisma access must stay inside server-side services/use-cases.

Do not access Prisma directly from:

* React components;
* client wrappers;
* unrelated utility layers;
* browser code.

Client-side wrappers should call local API routes where appropriate.

## Frontend/style rules

Use existing layout and styling patterns.

Use the `desktop:` Tailwind breakpoint.

Do not introduce `lg:` breakpoints.

Do not perform unrelated UI redesigns.

Preserve Italian user-facing text exactly unless a change is required to preserve behaviour.

Use English only for code comments.

## Migration rules

Replace Firebase runtime access with local PostgreSQL/Prisma-backed services.

Use local session/auth helpers instead of Firebase auth for migrated server routes.

Preserve existing behaviour.

Keep the implementation scalable for large local datasets.

Prefer small coherent vertical slices.

Avoid broad rewrites.

Avoid unrelated refactors.

Do not touch generated files unless required.

Do not change public behaviour without tests.

Do not claim full Firebase removal unless `rg` confirms active runtime paths no longer depend on Firebase credentials.

## Testing strategy

Prefer targeted Vitest files for changed routes/services.

Use nearby existing tests when available.

If a test cannot be written before implementation, explain why, then add the closest protective regression test before or immediately after the change.

Do not skip tests to make the goal pass.

Do not hide failures.

Do not commit unverified code.

For each slice, run the most relevant available checks, for example:

```bash
npx vitest run <targeted-test-file>
npx vitest run <broader-related-test-file-or-folder>
npx tsc --noEmit --incremental false
```

If a broader test suite fails for reasons unrelated to the slice, verify and document the unrelated failure with evidence. Do not claim the slice is fully verified unless the relevant checks pass.

## Required checks before every commit

Run:

```bash
npx tsc --noEmit --incremental false
```

Run diff checks only on touched files:

```bash
git diff --check -- <touched files>
```

Review unstaged and staged changes:

```bash
git status --short
git diff -- <touched files>
git diff --cached
```

Confirm that no forbidden file is staged.

Commit only if:

* targeted tests pass;
* broader relevant tests pass or unrelated failures are clearly documented;
* TypeScript passes;
* diff checks pass;
* the handoff document is updated;
* no forbidden files are staged;
* the staged diff contains only the intended slice.

Use clear focused commit messages, for example:

```bash
git commit -m "migrate expense categories to local api"
git commit -m "replace snapshot firebase timestamps"
git commit -m "migrate dividend income service to prisma"
```

Push after each coherent verified commit:

```bash
git push origin handoff/firebase-to-postgres-local-runtime
```

## Final verification phase

When no obvious Firebase runtime usage remains, run a final repository check:

```bash
rg -n "firebase|Firestore|adminDb|Timestamp|requireFirebaseAuth|lib/firebase" app lib components types __tests__
```

For each remaining match, decide whether to remove it or document why it is not runtime-sensitive.

Also search broader dependency/config references without modifying forbidden files:

```bash
rg -n "firebase|firebase-admin|firebase/firestore|FIREBASE|NEXT_PUBLIC_FIREBASE|GOOGLE_APPLICATION_CREDENTIALS" .
```

Classify remaining matches.

If Firebase packages are still present in dependencies, remove them only if they are no longer required by runtime code, tests, scripts, or intentionally retained tooling. If removal would be risky or outside the current migration scope, document the reason instead of forcing it.

Run final checks:

```bash
npx prisma generate
npx tsc --noEmit --incremental false
```

Run the relevant Vitest suites for all migrated areas. Prefer a broader test run if practical.

Run final diff/status checks:

```bash
git status --short
git diff --check
git diff
git diff --cached
```

Update `docs/firebase-to-postgres-migration-handoff.md` with:

* final migration status;
* completed slices and commit hashes;
* tests/checks run;
* remaining Firebase references and classification;
* any non-runtime Firebase leftovers;
* blockers or caveats;
* recommended next manual review steps.

Make a final commit if the handoff update or final cleanup changed files.

Push the final commit.

## Stuck/blocker policy

If you repeat the same failed approach three times, stop that approach.

Do not loop blindly.

Investigate and choose a different narrow path.

If a real blocker prevents completion:

1. Leave the working tree safe.
2. Do not commit broken code.
3. Update the handoff document only if doing so is safe and useful.
4. Report:

   * the blocker;
   * commands run;
   * evidence;
   * files affected;
   * safest next action.

## Final response format

When the goal is complete, report:

* selected/completed migration slices;
* files changed;
* tests/checks run and results;
* commit hashes;
* whether the branch was pushed;
* final Firebase runtime usage search result;
* any remaining Firebase references and their classification;
* any caveats.

If the goal is not complete, report:

* completed slices;
* last successful commit hash;
* what remains;
* exact blocker;
* tests/checks run;
* current branch status;
* whether anything was pushed.

## Continuation rule

Do not return a final response after completing a single slice.

A completed slice is only an intermediate checkpoint.

After each successful commit and push, immediately start the next remaining Firebase runtime dependency.

Stop only when:

1. the full completion criteria are satisfied;
2. a hard blocker prevents safe progress;
3. the execution environment/tool budget prevents continuing safely.

If stopping before full completion, the final response must begin with:

`STOPPED_BEFORE_GOAL_COMPLETE`

and must explain why continuation was not possible.

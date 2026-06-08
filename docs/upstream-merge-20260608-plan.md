# Piano merge upstream GiuseppeDM98/main → enryIT/main — 2026-06-08

## Approach

Eseguire un merge reale di `upstream/main` dentro un branch dedicato basato su `origin/main`, senza modificare direttamente `main`. La risoluzione deve integrare le feature e i fix upstream preservando le modifiche del fork `enryIT`, evitando risoluzioni wholesale `ours`/`theirs` e documentando ogni conflitto o decisione in una matrice di audit.

## Scope

- In:
  - Base branch locale dedicato: `merge/upstream-gdm98-main-20260608`.
  - Base fork: `origin/main` = `d7d29b5059b9`.
  - Upstream da integrare: `upstream/main` = `157cce8b1d01`.
  - Merge base comune: `c229d39f05e2`.
  - Divergenza verificata `origin/main...upstream/main`: `73	81` (`left=origin-only`, `right=upstream-only`).
  - File modificati dal fork dalla base comune: 283.
  - File modificati da upstream dalla base comune: 208.
  - File modificati da entrambi: 48.
  - File protetti autorizzati esplicitamente dall’utente per questo branch: sì.
- Out:
  - Nessun merge diretto su `main`.
  - Nessun push verso `GiuseppeDM98/net-worth-tracker`.
  - Nessuna riscrittura ampia non richiesta o redesign UI scollegato dal merge.

## Stop gates

Fermarsi e chiedere decisione se si verifica uno di questi casi:

1. Conflitto semantico dove upstream e fork implementano comportamenti incompatibili non componibili.
2. Perdita potenziale di una feature locale del fork, inclusi fix recenti cashflow/investment edit permissions.
3. Modifica che richiede scelta product/UX non derivabile dal codice.
4. Test/typecheck falliscono per motivi non riconducibili chiaramente al merge o richiedono refactor ampio.
5. Comandi Git indicano ancestry incompleta: il commit finale deve avere sia `origin/main` sia `upstream/main` come antenati.

## Action Items

[ ] Verificare remoti e branch: `origin` deve essere `git@github.com:enryIT/net-worth-tracker.git`, `upstream` deve essere `git@github.com:GiuseppeDM98/net-worth-tracker.git`.
[ ] Eseguire un merge reale: `git merge --no-ff --no-commit upstream/main` sul branch `merge/upstream-gdm98-main-20260608`.
[ ] Classificare tutti i conflitti con `git diff --name-only --diff-filter=U` e `git status --short`.
[ ] Delegare a Codex la risoluzione dei conflitti file-by-file usando le skill richieste e vietando `ours`/`theirs` wholesale.
[ ] Aggiornare/creare `docs/upstream-merge-20260608-audit.md` con matrice per file conflittuale/sovrapposto: upstream intent, local intent, resolution, tests.
[ ] Verificare indipendentemente il diff e l’audit: nessun marker `<<<<<<<`, nessun file locale cancellato per errore, nessuna regressione evidente nei fix locali.
[ ] Eseguire validazione: test mirati sui domini toccati, `npm test`, `npx tsc --noEmit`, `git diff --check`, `npm run build` se l’ambiente lo consente; browser automation Playwright solo se i cambi UI critici lo richiedono o se i test E2E sono disponibili.
[ ] Commit merge con messaggio esplicito, push a `origin/merge/upstream-gdm98-main-20260608`, creare PR verso `enryIT/net-worth-tracker:main`.

## File modificati da entrambi — rischio conflitto/omissione

- `AGENTS.md`
- `CLAUDE.md`
- `Draft Release Temp.md`
- `README.md`
- `__tests__/budgetUtils.test.ts`
- `__tests__/monthlyEmailService.test.ts`
- `app/api/user/monthly-email/send/route.ts`
- `app/dashboard/allocation/page.tsx`
- `app/dashboard/assets/page.tsx`
- `app/dashboard/cashflow/page.tsx`
- `app/dashboard/history/page.tsx`
- `app/dashboard/page.tsx`
- `app/dashboard/settings/page.tsx`
- `app/page.tsx`
- `components/assets/AssetCard.tsx`
- `components/assets/AssetDialog.tsx`
- `components/assets/AssetManagementTab.tsx`
- `components/assistant/AssistantPageClient.tsx`
- `components/cashflow/BudgetTab.tsx`
- `components/cashflow/CurrentYearTab.tsx`
- `components/cashflow/ExpenseTrackingTab.tsx`
- `components/cashflow/TotalHistoryTab.tsx`
- `components/dividends/DividendStats.tsx`
- `components/expenses/ExpenseDialog.tsx`
- `components/expenses/ExpenseTable.tsx`
- `components/fire-simulations/CoastFireTab.tsx`
- `components/goals/GoalFormDialog.tsx`
- `lib/providers/QueryClientProvider.tsx`
- `lib/query/queryKeys.ts`
- `lib/server/assistant/prompts.ts`
- `lib/server/monthlyEmailService.ts`
- `lib/services/assetService.ts`
- `lib/services/assistantMonthContextService.ts`
- `lib/services/budgetService.ts`
- `lib/services/dividendIncomeService.ts`
- `lib/services/expenseService.ts`
- `lib/services/fireService.ts`
- `lib/services/hallOfFameService.ts`
- `lib/services/pdfDataService.ts`
- `lib/utils/budgetUtils.ts`
- `lib/utils/pdfTimeFilters.ts`
- `package-lock.json`
- `package.json`
- `types/assets.ts`
- `types/budget.ts`
- `types/dividend.ts`
- `types/expenses.ts`
- `types/hall-of-fame.ts`

## File protetti rilevati

- `Draft Release Temp.md`: origin_changed=True, upstream_changed=True
- `Temp.md`: origin_changed=True, upstream_changed=False

Nota: l’utente ha autorizzato esplicitamente l’inclusione dei file protetti su questo branch dedicato per ottenere un merge upstream completo.

## Validation plan

- Git integrity:
  - `git status --short --branch`
  - `git diff --check`
  - `git merge-base --is-ancestor origin/main HEAD`
  - `git merge-base --is-ancestor upstream/main HEAD`
  - `git rev-list --parents -n 1 HEAD` dopo il commit.
- Static checks:
  - `npx tsc --noEmit`
  - `npm run lint` se disponibile e non eccessivamente rumoroso.
- Tests:
  - `npm test` completo.
  - Test mirati su file/aree conflittuali: cashflow, budget, assets, dividends, monthly email, query keys, dashboard/history/allocation.
  - Playwright/browser automation: verificare solo i flussi UI critici se build/dev server ed eseguibile browser sono disponibili.
- Build/release:
  - `npm run build`; se fallisce per env Firebase placeholder già nota, distinguere compile/type error da blocker ambientale.

## Release / rollback checklist

- Release:
  - PR draft o normale verso `enryIT:main`, mai verso upstream.
  - Evidenziare nel PR i domini a rischio review: dashboard/history/allocation, cashflow budget, assets, assistant, monthly email, package/e2e.
  - Richiedere review manuale dei file sovrapposti e dei file protetti inclusi.
- Rollback:
  - Prima del merge del PR: chiudere PR o cancellare branch remoto.
  - Dopo merge su `main`: revert del merge commit con `git revert -m 1 <merge_commit>` sul fork `enryIT`, poi validare test/typecheck/build.
  - Se il problema è limitato a un dominio, preferire fix-forward solo se piccolo e verificabile; per regressioni critiche, rollback del merge commit.

# Next Firebase Migration Slices

Current residual count: 383 lines before the 2026-06-01 performance cache slice.

Priority order:
1. `lib/services/dashboardOverviewService.ts`
2. `lib/services/dividendService.ts`
3. `lib/services/dividendIncomeService.ts`
4. `lib/server/apiAuth.ts`
5. `lib/server/dividendUseCase.ts`

For each slice:
- add red boundary/regression test;
- migrate to local API/server service;
- run targeted tests;
- run `npx tsc --noEmit --incremental false`;
- update handoff;
- commit and push.

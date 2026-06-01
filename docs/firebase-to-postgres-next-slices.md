# Next Firebase Migration Slices

Current residual count: 383 lines.

Priority order:
1. `lib/services/performanceService.ts`
2. `lib/services/dashboardOverviewService.ts`
3. `lib/services/dividendService.ts`
4. `lib/services/dividendIncomeService.ts`
5. `lib/server/apiAuth.ts`

For each slice:
- add red boundary/regression test;
- migrate to local API/server service;
- run targeted tests;
- run `npx tsc --noEmit --incremental false`;
- update handoff;
- commit and push.

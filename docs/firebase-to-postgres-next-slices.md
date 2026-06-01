# Next Firebase Migration Slices

Current residual count: 383 lines before the 2026-06-01 performance cache slice.

Priority order:
1. `lib/services/dividendService.ts`
2. `lib/services/dividendIncomeService.ts`
3. `lib/server/apiAuth.ts`
4. `lib/server/dividendUseCase.ts`
5. `lib/server/dividendProcessor.ts`

For each slice:
- add red boundary/regression test;
- migrate to local API/server service;
- run targeted tests;
- run `npx tsc --noEmit --incremental false`;
- update handoff;
- commit and push.

# Performance Shared Type Provider Boundary

Use this reference when a performance/shared metrics type file imports an old runtime provider only for timestamp/date typing during a Firebase-to-local-runtime migration.

## Trigger

A shared type module such as `types/performance.ts` imports `firebase/firestore` only for `Timestamp` in serialized/cache interfaces, while behavior only requires objects that expose `toDate(): Date`.

## Proven pattern

1. Add a RED source-level Vitest boundary test that reads the shared type file and forbids provider imports:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('performance shared type Firebase boundary', () => {
  it('does not import Firebase runtime modules from shared performance types', () => {
    const source = readFileSync(join(process.cwd(), 'types/performance.ts'), 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});
```

2. Confirm RED fails for the expected provider import, not a harness error.
3. Replace the provider type import with a domain-neutral structural type:

```ts
export type PerformanceDateLike = {
  toDate(): Date;
};
```

4. Rename provider-specific serialized/cache types if they keep old-provider vocabulary in the codebase search. For example:
   - `FirestoreCashFlowData` -> `SerializedCashFlowData`
   - `FirestorePerformanceMetrics` -> `SerializedPerformanceMetrics`
   - `FirestoreRollingPeriodPerformance` -> `SerializedRollingPeriodPerformance`
   - `FirestorePerformanceData` -> `SerializedPerformanceData`

5. Update legacy service annotations/imports that referenced the old type names, but do not broaden into migrating the whole legacy service if it still performs provider-backed runtime reads/writes. Document that caveat.
6. Run the boundary test, nearby performance tests, and full typecheck.
7. Run the residual provider search and report remaining hits. Do not claim full provider removal unless the broad search is clean.

## Pitfalls

- A shared type fix can remove provider imports from the type boundary while a legacy service still imports the provider for runtime cache IO. Keep those separate slices.
- Avoid naming replacement types `TimestampLike` in shared domain files when residual searches include `Timestamp`; prefer domain-neutral names such as `PerformanceDateLike`.
- If setup commands mutate a lockfile without an intentional dependency change, revert that unrelated lockfile before staging.

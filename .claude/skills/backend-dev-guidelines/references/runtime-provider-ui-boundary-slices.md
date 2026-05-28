# Runtime Provider UI Boundary Slices

Use this reference when migrating active React/Next.js UI components away from an old runtime data provider dependency that is only used for client-side type narrowing or date conversion.

## Pattern: structural timestamp boundary

When a component imports `firebase/firestore` only for `Timestamp` checks such as:

```ts
import { Timestamp } from 'firebase/firestore';

const dateObj = date instanceof Date ? date : date instanceof Timestamp ? date.toDate() : new Date(date);
```

replace the provider-specific runtime dependency with an existing structural helper/type:

```ts
import { toDate, type TimestampLike } from '@/lib/utils/dateHelpers';

const formatDate = (date: Date | string | TimestampLike): string => {
  const dateObj = toDate(date);
  return format(dateObj, 'dd/MM/yyyy', { locale: it });
};
```

For form reset/default-value logic, prefer:

```ts
date: toDate(record.date),
```

rather than casting to the provider `Timestamp` type.

## RED test shape

Add a source-level regression test before implementation:

```ts
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const forbiddenProviderImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('UI provider boundary', () => {
  it.each([
    'components/domain/ComponentA.tsx',
    'components/domain/ComponentB.tsx',
  ])('%s does not import provider runtime modules for date handling', (filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).not.toMatch(forbiddenProviderImport);
  });
});
```

Import Vitest globals explicitly (`describe`, `expect`, `it`) unless the project config is known to inject globals. If the first RED fails because the harness is missing globals, fix the harness and rerun RED until it fails for the expected provider import.

## Scope discipline

- This is a valid narrow migration slice even if the same component still imports other legacy service wrappers.
- Do not broaden the slice into asset/expense/dividend service migration unless the test requires it.
- Document remaining wrapper imports as caveats in the handoff file.
- Run the targeted boundary test, nearby date/helper/domain tests, TypeScript, and a final residual-provider search.

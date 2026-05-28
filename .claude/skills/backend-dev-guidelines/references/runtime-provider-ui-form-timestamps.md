# Runtime Provider UI Form Timestamp Boundaries

Use this pattern when an active React/Next.js UI form imports a legacy runtime provider SDK only to create timestamps for submitted records.

## Trigger

- A client component imports something like `Timestamp` from `firebase/firestore`.
- The import is only used for new or updated record timestamps, not provider-specific querying.
- The domain type already accepts `Date` or can accept a tiny structural local type.

## Workflow

1. Add a source-level Vitest boundary test before editing production code.

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenProviderImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('feature UI provider boundary', () => {
  it('keeps FormComponent free of provider runtime imports for timestamp creation', () => {
    const source = readFileSync('components/feature/FormComponent.tsx', 'utf8');

    expect(source).not.toMatch(forbiddenProviderImport);
  });
});
```

2. Run the targeted test and confirm RED fails because the component still imports the provider.
3. Replace provider timestamp creation with `new Date()` if the receiving type/service already accepts `Date`.
4. Do not broaden the slice into shared type migration unless necessary for TypeScript.
5. Run the targeted boundary test, nearby feature tests, TypeScript, and `git diff --check` on touched files.
6. Update the migration handoff with:
   - the exact UI file removed from provider runtime access;
   - RED failure evidence;
   - tests/checks run;
   - caveats such as shared type files that still import provider timestamp types.
7. Rerun the residual provider search. State remaining hits without claiming full removal unless the search is clean.

## Example

A goal form used `Timestamp.now()` from Firebase only to populate `createdAt` and `updatedAt` on a submitted `InvestmentGoal`. Since the type already allowed `Date`, the minimal migration was:

```ts
// before
const now = Timestamp.now();

// after
const now = new Date();
```

The source-level test guarded the active UI file against reintroducing `firebase/firestore`, while the handoff explicitly noted that shared `types/goals.ts` still imported Firebase `Timestamp` for a later, separate type-boundary slice.

## Pitfalls

- Do not write tests after the production edit; the value is proving the source guard catches the provider import.
- Do not use `Date.now()` when the domain expects a `Date` object.
- Do not claim shared type cleanup if only the component import was removed.
- Do not stage package-lock changes caused by setup commands unless dependencies intentionally changed.

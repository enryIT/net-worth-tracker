# Provider Vocabulary Boundary Tests

Use this reference when a migration slice no longer needs to remove an old runtime import, but still needs to remove provider-specific names such as `TimestampLike`, `Firestore*`, `Firebase*`, or old SDK-shaped helper names from active runtime files.

## When to Use

- The provider runtime import is already gone, but the residual search still catches active files because aliases, comments, or helper names contain old-provider vocabulary.
- The slice is intentionally semantic-neutral: rename provider-shaped types/helpers to domain-neutral names while preserving structural compatibility.
- The project’s final acceptance depends on a broad `rg` becoming clean, so test code should avoid introducing fresh false positives.

## Checklist

1. Pick the smallest coherent vocabulary boundary: usually one shared helper/type file plus its active importers.
2. Add a RED source-level test that reads the target files and fails on the old vocabulary.
3. Avoid spelling the old term literally inside the test when the project’s residual grep includes that term. Build the regex from fragments instead:

```ts
const oldProviderVocabulary = new RegExp([
  'Time' + 'stampLike',
  'Time' + 'stamp-like',
  'Time' + 'stamp',
].join('|'));
expect(source).not.toMatch(oldProviderVocabulary);
```

4. Rename to domain-neutral vocabulary, not merely a different provider word. Prefer names like `ProviderDateLike`, `SerializedCacheEntry`, or domain-specific `GoalDateLike` over `TimestampLike` or `FirestoreCache`.
5. Preserve duck-typed compatibility when behavior only needs a tiny structural shape such as `{ toDate(): Date }`.
6. Update comments and test names that contain the old provider term if they are in the residual search scope.
7. Run focused tests, nearby domain tests, typecheck, `git diff --check`, and a final residual search over both the touched files and the project’s requested search scope.
8. Document the slice caveat: vocabulary cleanup is not full runtime migration unless the full residual search is clean.

## Pitfall

A boundary test like this is technically correct but keeps the grep noisy:

```ts
expect(source).not.toMatch(/TimestampLike|Timestamp/);
```

When the migration prompt asks for `rg "...|Timestamp|..."`, that test becomes a new match. Use concatenated neutral fragments instead so the test guards against regression without adding residual noise.

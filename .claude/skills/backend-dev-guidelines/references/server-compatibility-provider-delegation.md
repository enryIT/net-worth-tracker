# Server Compatibility Provider Delegation

Use this pattern when a legacy server-side service/helper still imports an old runtime provider (for example Firebase Admin/Firestore) but an equivalent local/server-backed service already exists.

## When this applies

- The legacy helper is still imported by un-migrated callers, or it is a stale server helper that appears in the old-provider residual search and can trigger credentials/runtime initialization during final acceptance.
- The public function signature can remain stable.
- The actual business behavior already exists in a local service/use-case, usually under `lib/server/*`.
- The slice goal is provider-boundary isolation, not a broad domain rewrite.
- Durable project guidance or handoff docs still describe the helper as an old-provider/Admin SDK boundary; update those docs in the same slice so future agents do not reintroduce the old pattern.

## RED test shape

Add a source-level boundary test before implementation that:

1. Reads the legacy helper source file.
2. Fails if old provider imports or symbols are present, such as:
   - `firebase-admin`
   - `@/lib/firebase/admin`
   - `adminDb`
   - provider `Timestamp`
   - provider-specific comments that still advertise the helper as an SDK/Admin repository.
3. Mocks the local service/use-case.
4. Calls the legacy exported helper and asserts it delegates to the local service with the expected arguments.

This verifies both halves of the migration: old runtime dependency removed and compatibility behavior preserved. If the delegation test times out or fails during import because the old helper reaches provider credentials/runtime setup, keep the source-level assertion in the same test file so the RED reason remains explicit and actionable.

## Implementation pattern

- Keep the legacy exported helper name and arguments where compatibility matters.
- Remove old provider imports entirely.
- Import only the local service/use-case.
- Delegate directly unless the legacy function needs minimal argument adaptation.
- Keep route handlers thin; do not move Prisma into the legacy helper if the local service already owns persistence.

Example shape:

```ts
import { invalidateLocalDashboardOverviewSummary } from '@/lib/server/dashboardOverviewInvalidationService';

export async function invalidateDashboardOverviewSummaryServer(
  userId: string,
  reason: string,
): Promise<void> {
  await invalidateLocalDashboardOverviewSummary(userId, reason);
}
```

## Verification checklist

- Targeted boundary test fails RED for the expected provider import/delegation reason.
- Targeted boundary test passes GREEN after the minimal change.
- Nearby local service and route tests pass as broader regression coverage.
- `npx tsc --noEmit --incremental false` passes when the project requires it.
- `git diff --check -- <touched files>` passes.
- Final old-provider search confirms the touched legacy helper no longer appears in runtime hits.
- Do not claim full provider removal unless the full repository search is clean.

## Pitfalls

- Do not skip stale helpers just because current code search finds no active callers; if the helper appears in the old-provider residual search, final runtime acceptance can still fail by importing it directly or through future compatibility paths. A tiny delegation wrapper is a valid narrow slice when an equivalent local service exists.
- Do not rewrite all callers in the same slice if preserving the legacy helper gives a safer compatibility boundary.
- Do not reimplement local service logic inside the legacy helper.
- A valid RED signal may happen before test collection if importing the legacy helper triggers a transitive old-provider initialization error (for example Firebase `auth/invalid-api-key`) or hangs/times out while reaching old Admin SDK paths. Treat that as expected only when the new test imports the legacy helper and a source-level assertion also proves the provider boundary still leaks; then implement the smallest delegation wrapper and rerun the same test to GREEN.
- When the slice removes a legacy helper from a previously documented residual list, update older handoff notes that named that helper so the handoff stays internally consistent, not just append a new slice note.
- When durable project guidance says the helper is the canonical old-provider/Admin repository, patch that guidance in the same change; otherwise future agents may follow stale instructions and reintroduce the dependency.
- Do not stage incidental lockfile changes from setup commands unless dependency changes were intentional.
- Do not count provider-name strings inside the boundary test itself as runtime hits; report them separately as test-only residuals.

# Firebase to Postgres Migration Design

Date: 2026-05-16

## Understanding Summary

- Net Worth Tracker should remove Firebase from normal runtime and move to a self-hosted PostgreSQL backend.
- The target stack is Next.js, PostgreSQL, Prisma, Auth.js/NextAuth, local email/password auth, and TOTP 2FA.
- Firebase may remain only in isolated migration tooling for repeatable Firestore-to-Postgres imports.
- Existing multi-user behavior should remain: local users replace Firebase UIDs, and all user-owned data stays scoped by `userId`.
- UI behavior should remain stable where possible, while APIs and persistence boundaries may be redesigned cleanly.
- The system should be self-hosted pragmatic, future open-source friendly, financial-data hardened, and optimized for large datasets.
- External integrations should be optional; the core app must work with only Next.js and Postgres.

## Assumptions

- Household mode, demo mode, assistant features, snapshots, dividends, investments, budgets, themes, reports, and current core workflows remain in scope unless explicitly removed later.
- UUIDs are used for primary IDs on user-owned and major domain records.
- Firestore document IDs are stored only as optional `legacyFirebaseId` fields where useful for migration traceability.
- Docker Compose is the recommended install path, with manual Node/Postgres setup documented for advanced users.
- Demo mode becomes database-owned, likely through a local user flag such as `users.isDemo`.
- Optional integrations fail gracefully and do not block core tracking.
- Large-data scalability means server aggregates, indexes, pagination, and materialized summaries, not SaaS-grade high availability.
- Existing Firebase rules and setup docs move to an archived legacy location rather than remaining active guidance.

## Decision Log

| Decision | Alternatives Considered | Rationale |
| --- | --- | --- |
| Use a self-hosted local/server database architecture | Browser-only local DB, hybrid sync | Matches the current server-backed app shape and keeps a VPS path open. |
| Preserve multi-user local server behavior | Single-user only, single-user first | Closest replacement for the current Firebase UID ownership model. |
| Support both local PC and VPS deployments | PC only, server only | Keeps local development simple while supporting future self-hosting. |
| Use PostgreSQL | MariaDB, SQLite, Firebase-like BaaS | Best fit for relational financial data, indexes, migrations, and large datasets. |
| Remove Firebase from runtime, keep migration-only access | Hard delete, phased runtime fallback | Clean runtime without blocking migration from existing Firestore data. |
| Use local email/password auth | Admin-only users, first-run owner only | Preserves current registration/login behavior. |
| Keep demo mode | Remove demo mode, seed-only samples | Preserves the current public demo workflow. |
| Use repeatable idempotent Firestore import | One-time import, manual export/import only | Supports dry runs, schema iteration, and safer cutover. |
| Use new Postgres IDs plus `legacyFirebaseId` | Preserve Firestore IDs as primary keys, mapping tables everywhere | Keeps the future schema clean while preserving traceability. |
| Use UUIDs for main records | Auto-increment integers, hybrid by default | Opaque IDs fit current behavior and are safer in APIs. |
| Minimize UI changes | Server-first rewrite, hybrid UI rewrite | Reduces dashboard regression risk. |
| Use Prisma | Drizzle, raw SQL | Strong migration/type workflow for a large TypeScript app migration. |
| Allow clean API redesign | Compatibility-first, mixed only | Avoids preserving Firestore-shaped contracts permanently. |
| Use self-hosted pragmatic scale/reliability | SaaS-ready, HA-ready | Matches the intended deployment without unnecessary infrastructure. |
| Use financial-data hardened security | Standard-only, regulated SaaS-grade | Adds audit logs, rate limits, login history, and 2FA without compliance-heavy overhead. |
| Optimize for future open-source self-hosters | Maintainer-only, small team only | Requires predictable install, migration, and backup docs. |
| Recommend Docker Compose, also document manual setup | Docker only, manual only | Best default for self-hosters while staying transparent. |
| Make external integrations optional | Keep all required, strict offline only | Core app remains local, integrations enhance features when configured. |
| Provide both DB backup docs and app export/import | DB docs only, app export only | Covers operations and user data portability. |
| Archive Firebase docs in repo | Remove from active docs only, delete entirely | Keeps legacy reference available for migration/debugging. |
| Use Foundation + Vertical Slices migration | Big bang, thin Firebase-compatible facade, ad hoc feature rewrites | Establishes a clean base while reducing cutover risk. |

## Target Architecture

The runtime architecture should be:

```text
React UI/hooks
  -> typed API clients / app services
  -> Next.js route handlers or server functions
  -> domain services
  -> Prisma repositories
  -> PostgreSQL
```

Client runtime must not access the database directly. Existing hooks and UI components can stay familiar, but durable data access moves behind server-side APIs and repositories. This improves authorization, validation, transactions, auditability, aggregate queries, and large-data performance.

Firebase Auth, Firestore, Firebase Admin SDK, Firestore rules, and Firebase runtime environment variables should not be required for normal `next build` or app execution.

## Data Model And Ownership

The Postgres schema should use explicit relational structure rather than copying Firestore nesting. Major domain entities use UUID primary keys and optional `legacyFirebaseId` fields for imported records.

Likely schema groups:

- Identity: users, Auth.js accounts, sessions, verification tokens, password credentials.
- Security: TOTP credentials, recovery codes, login events, audit events.
- Configuration: settings, user preferences, feature flags, demo markers.
- Portfolio: assets, asset price history, snapshots, snapshot detail rows.
- Cashflow: expenses/income, categories, budgets, cost centers, transfers, investment operations.
- Income investing: dividends, coupons, scrape/import metadata.
- Household: participants, ownership profiles, split attribution records.
- Reporting/cache: dashboard summaries, performance metrics, benchmark/FX caches.
- Assistant: threads, messages, memory items, suggestions, pinned context metadata.
- Portability: export/import jobs and legacy import runs.

Every user-owned table should carry `userId`. Server-side code must scope queries from authenticated session context, not from trusted client-supplied ownership.

## Auth, Sessions, And Demo Mode

Auth should use Auth.js/NextAuth with Prisma-backed persistence and local email/password credentials. Registration must be configurable.

The first migration release includes optional TOTP 2FA:

- Enrollment and confirmation flow.
- Login challenge flow.
- Single-use recovery codes.
- Login/session/audit events.

Sessions should use HTTP-only cookies. API authorization helpers should be generalized away from Firebase names, for example `requireAuthenticatedUser()` or `requireUserSession()`.

Demo mode should be enforced server-side. A demo user flag or role should block mutation APIs in addition to existing disabled UI controls.

## Migration And Import

Firebase access belongs only in migration tooling. The Firestore-to-Postgres importer should be a CLI/script with:

- Dry run mode.
- Per-user and all-user import modes.
- Import run records in Postgres.
- Idempotent upserts using source collection plus `legacyFirebaseId` or equivalent constraints.
- Relationship resolution from legacy Firestore IDs to new UUIDs.
- Validation reports for inserted, updated, skipped, and failed rows.
- Explicit failure behavior that avoids silent partial corruption.

Nested Firestore structures and subcollections should be mapped intentionally into relational child tables. Normal runtime code should not import Firebase packages or require Firebase credentials.

## API And Service Migration

The permanent layering should be:

- UI components call hooks.
- Hooks call typed client API helpers.
- API routes validate input, resolve session, enforce demo/write policy, and delegate.
- Domain services implement workflow logic.
- Repositories perform Prisma queries and transactions.

Route handlers should stay thin: auth, validation, ownership, delegation, response.

Vertical slices should migrate complete workflows. A feature is not migrated until reads and writes both use Postgres for that workflow. Permanent service contracts should avoid Firestore concepts such as `Timestamp`, `deleteField`, collection names, and query-chain assumptions.

## Performance, Aggregates, And Jobs

Large-data behavior should be designed from the start:

- Index common ownership/date lookups such as `(userId, date)` and `(userId, year, month)`.
- Use cursor pagination for long transaction, dividend, operation, assistant message, and audit lists.
- Keep materialized summary tables for expensive dashboard/performance views.
- Recompute summaries synchronously for cheap edits and through jobs for expensive updates.
- Store job status in Postgres so failures and retries are visible.
- Keep optional benchmark, FX, and price caches with refresh metadata and fallback behavior.

The first version can use scheduled routes or a simple worker process. It should not require SaaS-grade queue infrastructure.

## External Integrations

The core app must work with only Next.js and Postgres. Integrations should be feature-gated:

- Anthropic: assistant hidden or degraded when no API key exists.
- Yahoo Finance and Borsa Italiana: manual prices remain possible.
- Frankfurter FX: cached/manual/fallback behavior is documented.
- Email and cron automation: disabled unless configured.
- Benchmark data: cached data is used if present; empty states remain recoverable.

Server code should distinguish integration disabled from integration failed.

## Backup, Export, Import, And Legacy Docs

Provide two portability layers:

- Operational backup docs for `pg_dump`, restore, and Docker volume handling.
- App-level schema-versioned export/import for user-owned domain data.

The app-level export should include metadata such as export version, app version, exported user, and created timestamp. Import should validate before writing and report conflicts clearly.

Move Firebase rules and setup references out of active guidance into `docs/legacy-firebase/` with migration notes.

## Testing And Rollout

Before replacing each workflow, add characterization tests for current behavior. Then migrate through Foundation + Vertical Slices.

Testing layers:

- Auth route tests: registration config, login, session, logout, TOTP, recovery codes, demo write blocking.
- Prisma repository/service tests with a test database.
- API route tests for sessions, ownership, validation, and demo mutation denial.
- Migration tests using Firestore fixtures, rerun idempotency, relationship mapping, and validation reports.
- Export/import tests for schema validation, round-trip fidelity, and conflict handling.
- Performance tests for dashboards, history, performance, assistant context, and long lists.

Rollout sequence:

1. Foundation: Prisma/Postgres, Auth.js, local auth, 2FA, demo policy, repository/API conventions.
2. Migration and portability framework: Firestore importer plus app export/import.
3. Core financial data: settings, preferences, assets, snapshots.
4. Cashflow workflows: expenses/income, categories, budgets, cost centers, transfers, investment operations.
5. Dividends, performance, history, and dashboard summaries.
6. Assistant threads, memory, context, and optional integrations.
7. Archive Firebase docs and remove runtime Firebase dependencies.

Final acceptance:

- No Firebase imports in runtime app paths.
- `next build` succeeds without Firebase env vars.
- Migrated slices have tests for reads, writes, auth, ownership, and demo behavior.
- Docker Compose and manual setup docs are current.
- Firestore import command is documented and idempotent.
- App-level export/import is documented and tested.
- Firebase docs are archived under legacy documentation.

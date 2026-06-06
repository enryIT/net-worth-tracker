# CSV Import Design

## Status

Milestone 7 is implemented as a narrow slice for dividend/coupon rows plus standalone fee/tax rows. Milestone 8 is currently implemented as a narrower operational slice for import history and rollback UI: the page shows committed and `rolledBack` batches and supports explicit rollback confirmation. Milestone 9 is implemented as the deferred hardening/release slice for 5,000-row validation, Italian date/number/bank-broker quirks, and rollout docs. Milestone 10 is implemented as the client-side commit-chunking slice: ready rows are split into 250-row batches with per-chunk idempotency keys and progress/failure copy while preserving the existing rollback surface. Milestone 11 is implemented as the import-run aggregation and grouped rollback slice: chunked commits share a logical `importRunId`, history shows grouped runs with child chunks, and grouped rollback rolls back every safe child batch while reporting partial/unsafe cases clearly. The M11 section below includes the release verification checklist and rollback checklist. The document remains the design reference for the rest of the importer.

## Context

Net Worth Tracker already models multiple financial movement types:

- ordinary cashflow entries for income and expenses;
- internal cash transfers that do not affect income/expense savings metrics;
- investment operations for buy/sell activity;
- dividends and coupons;
- taxes and fees associated with portfolio activity.

The CSV import feature should reduce manual entry while preserving the accounting semantics already present in the app. The design must also remain compatible with the Firebase-to-Postgres/local-runtime migration: route handlers stay thin, server-side business logic belongs in services/use-cases, and the app should not introduce new Firebase-specific runtime dependencies.

## Goals

- Import CSV files from arbitrary banks and brokers through configurable column mapping.
- Support all major movement families: cashflow, transfers, investment operations, dividends/coupons, taxes, and fees.
- Provide a required preview/reconciliation step before writing data.
- Allow users to save reusable mapping and classification presets.
- Detect likely duplicates conservatively.
- Track each import as a reversible batch.
- Avoid persisting raw CSV files containing sensitive financial data.

## Non-goals for the first implementation

- Broker-specific hardcoded importers as the primary architecture.
- Blind automatic creation of assets, categories, subcategories, or accounts.
- Updating existing financial records through CSV import.
- Persisting raw CSV files for later reprocessing.
- AI-based classification as a requirement for the first release.

## Confirmed product decisions

- Use a universal configurable importer instead of broker-specific templates.
- Use hybrid classification: mapped source type when available, otherwise configurable rules and manual correction.
- Target up to roughly 5,000 rows per import in the first release.
- Process the raw CSV client-side where possible; send only normalized rows and confirmed import commands to the server.
- Require an import preview before commit.
- Persist import presets and import batches, not the raw CSV.
- Support rollback for records created by a batch.
- Implement support progressively by movement type even though the design supports all movement families.

## Proposed architecture

### 1. Client parser and mapper

The browser reads the raw CSV file and performs the first-stage parse:

- detect delimiter, headers, and basic shape;
- normalize date, number, decimal separator, and currency formats;
- let the user map source columns to canonical fields;
- generate normalized rows without persisting the raw file.

Important mapped fields include:

- date;
- description;
- amount, or debit/credit columns;
- currency;
- source movement type;
- source account and destination account;
- category and subcategory;
- asset name, ticker, or ISIN;
- quantity;
- unit price;
- fees;
- taxes.

### 2. Classification engine

The classification layer converts normalized rows into candidate domain movements.

Each row receives:

- `movementKind`;
- confidence level;
- explanation for the classification;
- validation issues;
- dedupe key;
- suggested links to existing app entities.

Suggested `movementKind` values:

- `cashflow`;
- `transfer`;
- `investmentOperation`;
- `dividend`;
- `fee`;
- `tax`;
- `unknown`.

Classification inputs:

- mapped source type;
- description keywords;
- amount sign;
- account names;
- ticker/ISIN presence;
- quantity and price presence;
- saved user rules.

Classification must remain explainable in the UI, for example: "Classificato come Cedola perché la descrizione contiene 'CEDOLA'."

### 3. Preview and reconciliation UI

The preview step is mandatory and should support bulk correction for medium-size imports.

The UI should show:

- total rows;
- rows ready to import;
- duplicate candidates;
- rows with errors;
- rows needing reconciliation;
- movement-type breakdown.

Useful filters:

- errors;
- warnings;
- duplicates;
- unknown movement type;
- missing asset/category/account;
- movement kind.

Rows should be editable before commit. Bulk edit is important for repeated classification fixes across many rows.

Missing entities are resolved through assisted creation or linking:

- create/link asset;
- create/link cash account;
- create/link category;
- create/link subcategory;
- assign cost center when applicable.

The importer must never create those entities silently without confirmation.

### 4. Server-side commit

The commit API receives validated normalized rows or chunks, not the raw CSV file.

Route handlers should only handle:

- authentication/session validation;
- request schema validation;
- demo-mode or authorization guards if needed;
- delegation to server services/use-cases.

Server services/use-cases should handle:

- final validation against authoritative user-owned data;
- idempotency;
- duplicate checks;
- creation of domain records;
- creation/update of the import batch;
- rollback safety metadata.

For 5,000-row imports, commit should be chunked, for example 250-500 rows per request.

## Data model proposal

### `csvImportPreset`

Stores reusable mapping and classification rules.

Fields:

- `id`;
- `userId`;
- `name`;
- `sourceLabel`;
- `columnMapping`;
- `localeOptions`;
- `classificationRules`;
- `createdAt`;
- `updatedAt`;
- `lastUsedAt`.

Example `localeOptions`:

```json
{
  "dateFormat": "dd/MM/yyyy",
  "decimalSeparator": ",",
  "thousandsSeparator": ".",
  "defaultCurrency": "EUR",
  "timezone": "Europe/Rome"
}
```

### `importBatch`

Tracks an import operation and supports rollback.

Fields:

- `id`;
- `userId`;
- `presetId`;
- `status`: `draft | committing | committed | rolledBack | failed`;
- `sourceFingerprint`;
- `rowCount`;
- `createdRecordCount`;
- `duplicateCount`;
- `errorCount`;
- `createdRecords`;
- `createdAt`;
- `committedAt`;
- `rolledBackAt`;
- `rollbackReason`.

`createdRecords` can be a compact list of records created by the batch:

```json
[
  { "kind": "cashflow", "id": "...", "rowIndex": 12 },
  { "kind": "investmentOperation", "id": "...", "rowIndex": 34 }
]
```

### `NormalizedImportRow`

This can be an in-memory/client-side structure unless server validation needs a temporary representation.

Fields:

- `rowIndex`;
- `rawPreview`;
- `canonicalFields`;
- `movementKind`;
- `confidence`;
- `classificationReason`;
- `issues`;
- `dedupeKey`;
- `resolvedRefs`.

## API proposal

### `POST /api/imports/validate`

Optional validation endpoint before commit.

Responsibilities:

- validate normalized rows against server-side schemas;
- check ownership of referenced entities;
- return validation issues and duplicate candidates;
- not write financial records.

### `POST /api/imports/commit`

Commits one import or one chunk of an import.

Responsibilities:

- create or continue an `importBatch`;
- verify idempotency key;
- create domain records;
- store created record references;
- return progress and final status.

### `POST /api/imports/{batchId}/rollback`

Rolls back a committed import batch when safe.

Responsibilities:

- load the batch for the authenticated user;
- verify the batch is rollbackable;
- delete records created by the batch;
- mark the batch as `rolledBack`;
- report any records that could not be safely rolled back.

### Import preset routes

Suggested CRUD routes:

- `GET /api/import-presets`;
- `POST /api/import-presets`;
- `PUT /api/import-presets/{presetId}`;
- `DELETE /api/import-presets/{presetId}`.

## Deduplication strategy

Use conservative deduplication. The importer should block or strongly warn only when a duplicate is highly likely.

Potential dedupe keys:

- cashflow: `userId + date + amount + normalizedDescription + categoryId? + accountId?`;
- transfer: `userId + date + amount + fromAccountId + toAccountId + normalizedDescription`;
- investment operation: `userId + date + assetId/ticker/isin + side + quantity + unitPrice + fees + taxes`;
- dividend/coupon: `userId + paymentDate + assetId/isin + grossAmount/netAmount + currency + dividendType`;
- fee/tax: `userId + date + amount + normalizedDescription + linkedMovementRef?`.

Deduplication output should distinguish:

- `duplicate`: high confidence, should not import by default;
- `possibleDuplicate`: warning, user decides;
- `unique`: no strong match found.

## Rollback strategy

First-release rollback should cover records created by the import batch only.

Rules:

- Do not update existing financial records in the first release.
- Rollback deletes records created by the batch when they are still safe to delete.
- If imported records were manually edited after import, rollback should either block those rows or require explicit confirmation.
- Rollback should not delete assets, categories, or accounts created during reconciliation unless those entities were also explicitly marked as batch-created and still unused outside the batch.

This intentionally avoids complex state restoration in the first implementation.

## Milestones and acceptance criteria

### Current implementation status after Milestones 1-11

Milestones 1-11 are implemented as narrow slices. Milestone 8 currently has a narrow operational slice for import history and explicit rollback UI. Milestone 9 adds the release hardening for 5,000-row validation, Italian date/number/bank-broker quirks, and operational release/rollback docs. Milestone 10 adds the client-side chunked commit orchestration for ready rows, with 250-row batching, per-chunk idempotency keys, and chunk progress/failure copy. Milestone 11 adds logical import-run aggregation, grouped history, and grouped rollback for safe child batches. The current code supports deterministic preview, preset persistence, preview reconciliation, ordinary cashflow commit/rollback, neutral internal transfer commit/rollback, buy/sell investment operation commit/rollback, dividend/coupon plus standalone fee/tax commit/rollback, import history with committed/`rolledBack` batches plus explicit rollback confirmation, grouped import-run history/rollback for chunked commits, and chunked commit orchestration for large imports. Milestones 4 and 5 were intentionally committed together because the durable commit/rollback pipeline shares the same API route, service, repository, batch metadata, UI panel, and tests.

Implementation commits:

| Milestone | Status | Commit | Notes |
|---|---:|---|---|
| 1. Pure import foundation | Implemented | `da3f8f5` | Parser, mapping validation, normalization, deterministic classification, dedupe helpers, preview route/tests. |
| 2. Import presets | Implemented | `f4467bf` | Authenticated preset CRUD, ownership validation, preset UI controls/tests. |
| 3. Preview and reconciliation UI | Implemented | `033520d` | Wizard shell, filters, inline correction, bulk edit, assisted linking copy, preview-only UI tests. |
| 4. Cashflow commit and rollback | Implemented with M5 | `1a6e122` | Batch commit/rollback route, service, repository, cashflow created-record tracking, idempotency, tests. |
| 5. Internal transfers | Implemented with M4 | `1a6e122` | Transfer validation, neutral internal transfers, mixed batch metadata, mixed rollback, tests. |
| 6. Investment operations | Implemented | Current slice | Buy/sell validation, asset resolution by confirmed reference, weighted-average-cost/realized-gain semantics, optional cash-account impact, batch metadata, safe rollback, UI commit wiring, tests. |
| 7. Dividends, coupons, fees, and taxes | Implemented | Current slice | Dividend/coupon rows plus standalone fee/tax rows, batch metadata, safe rollback, UI commit wiring, tests. |
| 8. Import history, hardening, and rollout | Implemented as narrow slice | Current slice | Import history shows committed/`rolledBack` batches and rollback metadata; explicit rollback confirmation UI is in place. |
| 9. Release hardening and locale quirks | Implemented | Current slice | 5,000-row validation, short-year Italian dates, bank/broker number quirks, and operational release/rollback docs. |
| 10. Commit chunking and progress feedback | Implemented | Current slice | Split ready rows into fixed 250-row commit chunks with per-chunk idempotency keys and Italian progress/failure copy; existing batch rollback surface remains unchanged. |
| 11. Import-run aggregation and grouped rollback | Implemented | Current slice | Link chunked commit batches from one logical CSV import with `importRunId`, aggregate history into grouped runs with child chunks, and support one-click grouped rollback with partial/unsafe reporting. |

The release/rollback checklists below remain operational checklists, not proof that a production rollout has already happened. Automated verification was run for the committed slices, and the current Milestone 11 grouped rollback slice should still be manually release-checked before wider rollout. The historical action-item checkboxes in the milestone sections are roadmap/task lists and are not the canonical source of current implementation status; use the table above for committed status.

#### Known post-M11 scope after the current slice

The following items are intentionally not implemented yet:

- Broker-specific templates and broker-specific settlement heuristics.
- AI-assisted classification; classification remains deterministic and explainable.
- Expanded import history drilldown beyond grouped import-run history, child-chunk inspection, and created-record detail.
- Additional rollback UX hardening beyond the current explicit rollback UI and unsafe-rollback messaging.
- Automatic creation of missing assets, accounts, categories, or subcategories; current reconciliation surfaces missing references and keeps creation/linking explicit.
- Existing-record updates; first-release rollback only handles records created by the import batch.
- Virtualized or paginated preview hardening for imports that exceed the validated 5,000-row slice.
These items remain outside the current Milestone 11 slice. Do not treat Milestones 1-11 as a full CSV importer release; treat them as the committed foundation, first durable movement families, release-hardening slice, the chunked commit orchestration slice, and the grouped rollback slice.

#### Residual risk register after Milestones 1-11

This register is audit-derived from the cited commit diffs, each milestone's
In/Out scope and checklists, current source/test markers, and the explicitly
deferred scope documented above. It is stronger than a guess, but it is not a
production incident history or a full browser/runtime audit.

Use this register as the durable backlog seed for future importer work. It
captures the risks and deferred follow-ups left by each implemented milestone,
not only the latest slice.

| Milestone | Residual risks / deferred follow-up | Evidence / provenance | Suggested next work |
|---|---|---|---|
| M1. Pure import foundation | Parser, normalization, classification, and dedupe are deterministic and test-backed, but still generic. Broker dialects/templates, AI-assisted classification, and durable write behavior beyond preview were intentionally excluded. Preview remains validation-only and does not prove production write paths. | `da3f8f5`; scope/checklist: M1 parser, normalization, dedupe, preview-only validation; markers: `app/api/imports/validate/route.ts`, `lib/server/imports/{classification,csvParser,dedupe,mappingValidation,normalization,previewService}.ts`, `__tests__/csvImportFoundation.test.ts`, `__tests__/csvImportPreviewUi.test.ts`. | Add broker-specific fixture packs only after the universal importer remains stable; expand edge-case normalization tests before adding AI or broker templates. |
| M2. Import presets | Presets persist mappings and rules, but there is no preset versioning/migration model for future canonical-field changes. Presets do not store raw CSV by design, so later reprocessing still depends on the user providing the file again. | `f4467bf`; scope/checklist: M2 authenticated preset CRUD only; markers: `app/api/imports/presets/route.ts`, `app/api/imports/presets/[presetId]/route.ts`, `lib/server/imports/presetService.ts`, `lib/server/imports/presetRepository.ts`, `__tests__/csvImportPresetRoutes.test.ts`, `__tests__/csvImportPresetService.test.ts`. | Add preset schema versioning and migration/compatibility checks before changing canonical mapping shape. |
| M3. Preview and reconciliation UI | Reconciliation is still preview-only. Assisted linking and explicit creation are design/copy only, automatic entity creation is deferred, and browser-level interaction coverage plus preview virtualization/pagination are still missing. | `033520d`; scope/checklist: M3 wizard shell, inline correction, bulk edit, assisted linking flow design, no commit API; markers: `app/dashboard/cashflow/import-csv/page.tsx`, `__tests__/csvImportPreviewUi.test.ts`, release verification checklist in `docs/csv-import-design.md`. | Add Playwright/browser coverage for the wizard once a stable fixture harness exists; add explicit entity creation/linking flows only with separate confirmation and rollback semantics. |
| M4. Cashflow commit and rollback | Rollback covers batch-created cashflow records only. Existing-record updates remain out of scope. Duplicate detection is intentionally conservative and can miss semantically equivalent rows when descriptions or mapped fields differ. | `1a6e122`; scope/checklist: M4 cashflow commit/rollback, idempotency, created-record tracking; markers: `app/api/imports/commit/route.ts`, `app/api/imports/[batchId]/rollback/route.ts`, `lib/server/imports/{cashflowCommitService,cashflowCommitRepository,cashflowCommitTypes}.ts`, `__tests__/csvImportCommitRoutes.test.ts`, `__tests__/csvImportCashflowCommitService.test.ts`. | Improve duplicate detection with richer user-visible matching evidence; keep existing-record updates out of scope until rollback safety metadata is stronger. |
| M5. Internal transfers | Transfer imports require existing cash accounts and preserve KPI neutrality, but rollback is still unsafe if imported transfer effects are manually changed after commit. No automatic account creation is supported. | `1a6e122`; scope/checklist: M5 transfer classification, account resolution, mixed batch metadata, mixed rollback; markers: `lib/server/imports/cashflowCommitService.ts`, `lib/server/imports/cashflowCommitTypes.ts`, `app/dashboard/cashflow/import-csv/page.tsx`, `__tests__/csvImportCommitRoutes.test.ts`, `__tests__/cashflowUiRegression.test.ts`. | Add clearer unsafe rollback diagnostics and, if needed, account-linking UX before commit; do not add silent account creation. |
| M6. Investment operations | Imported trades preserve weighted-average-cost and cash-account semantics, but rollback depends on later asset/trade state still matching safety assumptions. Broker settlement heuristics and automatic asset creation remain deferred. | `d9623ea`; scope/checklist: M6 buy/sell validation, asset resolution, cash impacts, safe rollback; markers: `lib/server/imports/cashflowCommitService.ts`, `lib/server/imports/cashflowCommitTypes.ts`, `__tests__/csvImportCashflowCommitService.test.ts`, `__tests__/cashflowUiRegression.test.ts`. | Add grouped unsafe-case diagnostics for later trades/cash balance changes; add broker settlement rules only as opt-in templates with tests. |
| M7. Dividends, coupons, fees, and taxes | Dividend/coupon rows and standalone fee/tax rows are supported, but standalone fees/taxes are not automatically attached to related movements. AI classification and broker-specific reconciliation remain deferred. | `365093b`; scope/checklist: M7 dividend/coupon plus standalone fee/tax commit/rollback; markers: `app/api/imports/commit/route.ts`, `lib/server/imports/cashflowCommitTypes.ts`, `__tests__/csvImportCommitRoutes.test.ts`, `__tests__/csvImportCashflowCommitService.test.ts`, `docs/csv-import-design.md` M7 scope/acceptance. | Add explicit attachment/reconciliation UX if users need fee/tax linking; avoid automatic attachment without auditable rules. |
| M8. Import history and rollback UI | History shows committed and rolled-back batches, but drilldown/observability is still basic: failed-chunk inspection and deeper batch detail are limited. The rollback UX is explicit, but it is still per-batch rather than import-run aware. | `08a85e1`; scope/checklist: M8 history and rollback slice, explicit confirmation, auth routes; markers: `app/api/imports/history/route.ts`, `app/dashboard/cashflow/import-csv/page.tsx`, `lib/query/queryKeys.ts`, `__tests__/csvImport*.test.ts`, `docs/csv-import-design.md` M8 checklist. | Add deeper batch detail views, failed-chunk inspection, and safer multi-batch operational workflows. |
| M9. Release hardening and locale quirks | The importer is hardened for 5,000-row Italian bank/broker-style fixtures, short-year dates, quoted semicolon exports, and apostrophe thousands separators, but it does not prove every broker dialect or larger preview/browser performance. Preview virtualization remains deferred. | `38c2f5c`; scope/checklist: M9 5,000-row validation, short-year dates, broker quirks, release docs; markers: `lib/server/imports/normalization.ts`, `__tests__/csvImportFoundation.test.ts`, `__tests__/csvImportPreviewUi.test.ts`, `docs/project-status.md`. | Add broker fixture packs incrementally; measure browser memory/render performance before raising the validated row target. |
| M10. Commit chunking and progress feedback | Ready rows commit in 250-row chunks with per-chunk idempotency, but browser-level coverage is still absent and preview virtualization/pagination remains deferred. | `5b59bc4`; scope/checklist: M10 client-side chunking only, no route/service contract changes or import-run model; markers: `app/dashboard/cashflow/import-csv/page.tsx`, `__tests__/csvImportPreviewUi.test.ts`, `__tests__/csvImportCommitRoutes.test.ts`, `docs/project-status.md`. | Add Playwright coverage once seeded data exists and keep preview scaling work separate from commit orchestration. |
| M11. Import-run aggregation and grouped rollback | Grouped import-run history now links chunked batches and grouped rollback handles safe child batches, but browser-level proof is still absent and deeper child-chunk drilldown may need more UI if users rely on it. | `current slice`; scope/checklist: M11 grouped import-run history, child chunks, grouped rollback, bearer auth, route/service tests; markers: `app/api/imports/runs/[importRunId]/rollback/route.ts`, `app/dashboard/cashflow/import-csv/page.tsx`, `__tests__/csvImportImportRunRoutes.test.ts`, `__tests__/csvImportImportRunService.test.ts`. | Add browser-level coverage for grouped rollback and, if needed, richer child-chunk audit drilldown. |

Cross-cutting residual risks:

- The importer remains deterministic-first. AI-assisted classification is intentionally deferred and should remain optional, explainable, and reviewable.
- No raw CSV file persistence exists by design. This protects privacy but means later reprocessing requires the user to provide the source file again.
- Missing assets, accounts, categories, and subcategories require explicit user action. Silent creation remains out of scope until creation flows have ownership checks, audit metadata, and rollback semantics.
- Existing financial record updates remain out of scope. Milestones 1-11 only support creating new records and rolling back records created by import batches.
- Preview scaling is not complete. Commit requests are chunked, but preview virtualization/pagination still needs a dedicated milestone for larger imports.
- Browser/E2E coverage is still not the primary proof for the CSV import wizard. Current verification relies on unit, service, route, TypeScript, lint, and source-level UI guards.

#### Post-M11 roadmap

The detailed milestone sections below remain the historical specification for
M1-M11. Future work should be planned as new narrow slices from this roadmap,
starting with the highest operational risk first. Each post-M11 milestone is a
closure path for one or more residual risks left by M1-M11; it is not a separate
feature wishlist.

| Next milestone | Priority | Residual risk closed | Goal | Acceptance signal |
|---|---:|---|---|---|
| M12. Preview virtualization or pagination | High | M3/M9/M10 preview scaling and large-file browser performance gaps. | Keep the preview usable for large imports by avoiding full-table rendering while preserving filters, summaries, corrections, and bulk edit semantics. | A validated 5,000-row preview stays responsive; filters and bulk actions operate on the intended row set; no raw CSV persistence is introduced. |
| M13. Browser/E2E import wizard coverage | Medium-high | M3/M9/M10 lack of browser-level proof for the real wizard flow. | Add browser-level coverage for the real wizard flow after the M11/M12 surfaces stabilize. | A seeded browser test covers upload/mapping/preview/commit/progress/history/rollback and at least one failure path. |
| M14. Broker templates and fixture packs | Medium | M1/M7/M9 generic parser limits, broker dialect gaps, and settlement heuristics deferred scope. | Add opt-in broker/bank templates only after the universal importer and rollback surface remain stable. | Each template has a realistic fixture, documented mapping assumptions, deterministic parser coverage, and no silent movement/entity creation. |
| M15. Explicit entity linking and creation flows | Medium | M3/M5/M6 missing-entity resolution remains explicit but incomplete. | Let users resolve missing assets, cash accounts, categories, and subcategories with explicit confirmation and audit metadata. | Missing references can be linked or created through deliberate UI steps; rollback semantics are documented before any created entity is used by committed rows. |
| M16. Duplicate detection improvements | Medium | M1/M4 conservative dedupe can miss semantically equivalent existing records. | Improve duplicate matching while keeping evidence visible and avoiding dangerous automatic suppression. | Duplicate candidates show matching evidence/confidence; users can override; tests cover near-duplicate and false-positive cases. |
| M17. Existing-record update/import reconciliation | Low | M4/M10 create-only semantics leave existing-record updates unreconciled. | Consider explicit updates to existing records only after create-only rollback is mature. | Update previews show field-level diffs, require confirmation, and store enough safety metadata to block or reverse unsafe updates. |
| M18. Optional AI-assisted classification | Low | M1/M7 deterministic-only classification leaves ambiguous rows manual. | Add AI suggestions as an optional explainable layer over deterministic rules, never as an automatic commit path. | AI suggestions include reason/confidence, can be ignored, and require user review before rows become commit-ready. |

### Milestone 1: Pure import foundation

Approach: build the deterministic import core before any database write or UI commit path. This keeps parsing, mapping, normalization, classification, and dedupe behavior testable without touching persisted financial data.

Scope:

- In: CSV parser adapter, column mapping model, locale-aware normalization, `NormalizedImportRow` types, dedupe key helpers, basic deterministic classification rules, unit tests.
- Out: database writes, import preset persistence, preview UI, rollback UI, broker-specific templates, AI classification.

Action items:

- [ ] Add canonical import types for mapped columns, normalized rows, movement kinds, classification confidence, issues, and dedupe status.
- [ ] Add a CSV parsing adapter that detects delimiter/header shape and returns rows without persisting raw file contents.
- [ ] Add locale-aware date, decimal, thousands separator, currency, debit/credit, and amount normalization helpers.
- [ ] Add mapping validation that distinguishes blocking errors from warnings.
- [ ] Add deterministic classification rules for `cashflow`, `transfer`, `investmentOperation`, `dividend`, `fee`, `tax`, and `unknown`.
- [ ] Add dedupe key generation helpers for each supported movement family.
- [ ] Verify with focused unit tests for parser, mapping validation, normalization edge cases, classifier output, and dedupe key stability.

Acceptance criteria:

- A valid 5,000-row CSV can be parsed and normalized in memory without server upload of the raw CSV.
- Invalid required fields produce row-level blocking errors, not thrown uncaught exceptions.
- Amount sign handling is deterministic for single amount columns and debit/credit column pairs.
- Classification output includes a movement kind, confidence, and human-readable reason.
- Dedupe keys are stable for semantically equivalent rows after normalization.
- No financial records are created or modified in this milestone.

Release verification checklist (Milestone 1, non-persistent):

- [ ] `npm test -- --run __tests__/csvImportFoundation.test.ts __tests__/importsValidateRoute.test.ts __tests__/csvImportPreviewUi.test.ts` passes.
- [ ] `POST /api/imports/validate` requires Firebase bearer token and rejects mismatched `userId`.
- [ ] Route returns preview-only payload (`ok`, `data.summary`, row issues) and performs no writes.
- [ ] `/dashboard/cashflow/import-csv` shows preview copy and does not expose commit/save actions.
- [ ] Cashflow tab contains entrypoint link/button text `Importa CSV`.

Rollback checklist (Milestone 1, non-persistent):

- [ ] Hide/remove the `Importa CSV` entrypoint in `ExpenseTrackingTab`.
- [ ] Disable or remove `/dashboard/cashflow/import-csv`.
- [ ] Disable or remove `POST /api/imports/validate`.
- [ ] Re-run the standard cashflow and API auth route tests to confirm no regressions.
- [ ] No data rollback required because milestone does not persist CSV rows or create financial records.

### Milestone 2: Import presets

Approach: persist reusable mapping and classification configuration separately from import execution. Presets should improve repeated imports while remaining user-owned and safe to delete.

Scope:

- In: `csvImportPreset` model/service, authenticated preset API routes, ownership checks, validation tests.
- Out: financial movement commit, batch rollback, full import wizard UI.

Action items:

- [ ] Add `csvImportPreset` server-side service/use-case for create, list, update, and delete.
- [ ] Add thin authenticated route handlers for preset CRUD.
- [ ] Validate mapping shape, locale options, and rule shape before persistence.
- [ ] Ensure presets are scoped to the authenticated user and never fetched by client-supplied `userId` alone.
- [ ] Add tests for ownership, invalid payloads, update behavior, and delete behavior.
- [ ] Add minimal client-facing types/hooks only if needed by the preview wizard.

Acceptance criteria:

- Users can create, list, update, and delete only their own presets.
- Invalid mappings or classification rules are rejected before persistence.
- Preset routes keep auth/session/schema validation in the route layer and business logic in server services/use-cases.
- No raw CSV rows are stored inside presets.
- Tests cover ownership denial and malformed payloads.

Release verification checklist (Milestone 2, preset persistence only):

- [ ] `npm test -- --run __tests__/csvImportPresetService.test.ts __tests__/csvImportPresetRoutes.test.ts __tests__/csvImportPreviewUi.test.ts` passes.
- [ ] `GET/POST /api/imports/presets` and `PATCH/DELETE /api/imports/presets/{presetId}` require Firebase bearer token.
- [ ] Route handlers derive `userId` from Firebase token and reject client-supplied ownership fields.
- [ ] Preset payload validation rejects malformed mapping/locale/rule shape and rejects raw CSV content fields.
- [ ] `/dashboard/cashflow/import-csv` exposes preset UX (`Preset import`, `Salva preset`, `Carica preset`, `Aggiorna preset`, `Elimina preset`) while remaining preview-only (no commit action).

Rollback checklist (Milestone 2, preset persistence only):

- [ ] Hide preset controls from `/dashboard/cashflow/import-csv` while keeping preview validation available.
- [ ] Disable preset API routes (`/api/imports/presets*`) or guard them behind a feature flag.
- [ ] Delete persisted `csvImportPresets` documents if rollback requires full cleanup.
- [ ] Re-run CSV import preview and API auth tests to confirm no regressions outside preset CRUD.

### Milestone 3: Preview and reconciliation UI

Approach: add the user-facing import wizard without committing data yet. The preview must make classification, validation, duplicates, and unresolved references visible before any write.

Scope:

- In: import wizard shell, file upload step, mapping step, rule/classification step, preview table, filters, inline correction, bulk edit, assisted entity linking/creation flow design.
- Out: final commit API, rollback execution, full support for every movement-specific write path.

Action items:

- [ ] Add an “Importa CSV” entry point using existing Cashflow/page layout patterns.
- [ ] Add client-side file parsing with explicit privacy copy that the raw file is processed in the browser and not saved grezzo.
- [ ] Add mapping controls for required and optional canonical fields.
- [ ] Add preview summary cards for ready rows, errors, warnings, duplicates, and unresolved references.
- [ ] Add table filters for errors, warnings, duplicates, unknown movement kind, missing references, and movement kind.
- [ ] Add inline row correction for movement kind and key mapped fields.
- [ ] Add bulk edit for repeated fixes across selected rows.
- [ ] Add assisted linking flows and explicit creation design for missing assets, accounts, categories, and subcategories without silent creation.

Acceptance criteria:

- The user can move from CSV upload to mapped preview without writing financial records.
- Preview displays row-level issues and classification reasons in Italian user-facing text.
- Rows with blocking errors cannot be marked ready for commit.
- Missing entities require explicit user confirmation before being linked or before any future creation flow is allowed.
- Bulk edit updates selected rows consistently and recomputes validation/classification where needed.
- UI follows existing layout/styling patterns and uses `desktop:` rather than `lg:`.

Release verification checklist (Milestone 3, preview and reconciliation only):

- [ ] `npm test -- --run __tests__/csvImportPreviewUi.test.ts` passes.
- [ ] `npx tsc --noEmit --incremental false` passes.
- [ ] `/dashboard/cashflow/import-csv` renders the wizard shell, filters, row correction, bulk edit, and assisted linking copy while staying preview-only.
- [ ] Manual row edits update only preview state and show `Correzione manuale applicata in anteprima`.
- [ ] No commit/save action appears in the page.

Rollback checklist (Milestone 3, preview and reconciliation only):

- [ ] Hide/remove the Milestone 3 wizard shell from `/dashboard/cashflow/import-csv`.
- [ ] Remove the client-side row correction, bulk edit, and assisted linking UI additions introduced in this milestone.
- [ ] Keep validation and preset persistence behavior from earlier milestones unchanged.
- [ ] No data rollback is required because this milestone does not persist CSV rows or create records.
- [ ] Re-run `npm test -- --run __tests__/csvImportPreviewUi.test.ts` and `npx tsc --noEmit --incremental false`.

### Milestone 4: Cashflow commit and rollback

Approach: commit the first narrow vertical slice end-to-end for ordinary income/expense rows only. This proves batch tracking, dedupe checks, idempotency, and rollback before adding more movement families.

Scope:

- In: `cashflow` row server validation, import batch creation, chunked commit, created-record tracking, cashflow rollback, targeted route/use-case tests.
- Out: transfers, investment operations, dividends/coupons, standalone fee/tax handling.

Action items:

- [ ] Add `importBatch` persistence for committed cashflow imports.
- [ ] Add server-side validation for normalized cashflow rows and referenced categories/accounts/cost centers.
- [ ] Add `POST /api/imports/commit` support for cashflow chunks with idempotency keys.
- [ ] Track every created cashflow record in the batch metadata.
- [ ] Add conservative duplicate detection against existing cashflow records.
- [ ] Add `POST /api/imports/{batchId}/rollback` support for imported cashflow records.
- [ ] Invalidate the same caches/derived views affected by manual cashflow mutations.
- [ ] Verify with targeted route/use-case tests and `git diff --check`.

Release / rollback checklist:

- [ ] For M4-only validation, confirm cashflow ordinary rows require a resolved existing category. After M5, the same commit action may also include ready internal transfer rows with resolved cash accounts.
- [ ] Confirm the success panel shows batch ID and created record count after commit.
- [ ] Confirm repeating the same payload with the same idempotency key returns the same batch instead of duplicating records.
- [ ] Confirm rollback removes the batch-created records and surfaces the rolled-back state in the UI.
- [ ] Confirm unresolved or duplicate rows remain outside the commit payload.

Acceptance criteria:

- Ready cashflow rows can be committed in chunks and are visible wherever manual cashflow entries are visible.
- Duplicate rows are blocked or surfaced as high-confidence duplicate warnings before creation.
- Repeating the same chunk with the same idempotency key does not create duplicate records.
- Rollback removes records created by the batch when they are still safe to delete.
- Imported expenses remain negative and imported income remains positive according to existing sign conventions.
- Existing cashflow behavior and KPI semantics are preserved.

### Milestone 5: Internal transfers

Approach: extend the proven batch/rollback pipeline to transfer rows while preserving the existing rule that transfers do not affect income/expense savings metrics.

Scope:

- In: transfer classification refinement, account resolution, server validation, commit, rollback, tests for KPI neutrality.
- Out: investment operations and dividends/coupons.

Action items:

- [x] Add transfer-specific canonical fields for source account, destination account, amount, date, and description.
- [x] Validate source and destination account references before commit.
- [x] Add transfer commit handling to the existing import batch pipeline.
- [x] Track transfer records in `importBatch.createdRecords`.
- [x] Extend rollback to transfer records.
- [x] Add regression tests proving imported transfers do not change income, expenses, or savings KPIs.

Release / rollback checklist:

- [ ] Confirm the commit payload can include both ready `cashflow` rows and ready `transfer` rows.
- [ ] Confirm transfer rows require existing cash accounts for source and destination and reject identical accounts.
- [ ] Confirm imported transfer records are stored with `purpose: 'neutral_transfer'` and are tracked as `kind: 'internalTransfer'` in batch metadata.
- [ ] Confirm imported transfers adjust source/destination cash balances exactly like manual internal transfers.
- [ ] Confirm ordinary cashflow KPI totals remain unchanged by transfer-only imports.
- [ ] Rollback plan: use `POST /api/imports/{batchId}/rollback` for the affected batch while imported records are unmodified.
- [ ] Manual rollback fallback: delete only batch-created internal transfers, reverse their cash-account quantity deltas, and mark the import batch rolled back; do not touch unrelated manual transfers.
- [ ] Stop rollout if rollback reports modified imported records, because manual edits make automatic reversal unsafe.

Acceptance criteria:

- Transfer rows create the same domain records/effects as manual internal transfers.
- Transfers are excluded from ordinary cashflow income/expense totals.
- Missing or identical source/destination accounts block the affected rows.
- Rollback restores transfer-created effects without touching unrelated records.
- Existing transfer UI/listing behavior continues to work for imported transfers.

### Milestone 6: Investment operations

Approach: add buy/sell rows after cashflow and transfer semantics are stable. Imported trades must use the existing investment operation model, not ordinary expenses or income.

Scope:

- In: buy/sell validation, asset resolution, quantity/price/fee/tax parsing, cash-account impact when mapped, commit, rollback, tests.
- Out: automatic asset creation without confirmation, brokerage-specific trade settlement heuristics beyond mapped fields.

Action items:

- [x] Add investment-operation canonical fields for side, asset, quantity, unit price, currency, fees, taxes, and optional cash account.
- [x] Validate asset links by confirmed asset reference, ticker, or ISIN resolution.
- [x] Add buy/sell commit handling through the import batch pipeline.
- [x] Preserve existing weighted-average-cost, realized gain, tax, and optional cash-account impact semantics.
- [x] Track created investment operation records in the batch.
- [x] Extend rollback to investment operations and related imported cash impacts when safe.
- [x] Add tests ensuring imported trades are not modeled as cashflow expenses/income.

Release / rollback checklist:

- [ ] Confirm the commit payload can include ready `cashflow`, `transfer`, and `investmentOperation` rows in the same batch.
- [ ] Confirm investment rows require a resolved user-owned non-cash asset reference by ticker, ISIN, or exact asset name.
- [ ] Confirm optional cash-account references are user-owned cash assets before applying buy/sell cash effects.
- [ ] Confirm buy rows decrease the mapped cash account by gross amount plus fees and taxes, while sell rows increase it by gross amount minus fees and taxes.
- [ ] Confirm imported trades are stored as `investmentOperations` and as `kind: 'investmentOperation'` in batch metadata, never as ordinary cashflow income/expense records.
- [ ] Confirm the CSV import UI invalidates assets, operations, realized gains, transfers, expenses, and dashboard overview caches after commit and rollback.
- [ ] Rollback plan: use `POST /api/imports/{batchId}/rollback` while imported investment operations remain the latest operation state for the affected asset quantity.
- [ ] Manual rollback fallback: delete only batch-created investment operations, restore the affected asset quantity/average cost from the operation safety metadata, reverse only imported cash-account net effects, and mark the import batch rolled back.
- [ ] Stop rollout if rollback returns `409` for unsafe investment-operation reversal, because later manual trades or balance changes make automatic restoration unsafe.

Acceptance criteria:

- Buy/sell rows create investment operations equivalent to manual entries.
- Quantity, unit price, fees, and taxes are validated before commit.
- Imported trades do not pollute ordinary income/expense KPIs.
- Optional cash-account impact matches existing manual trade behavior.
- Rollback handles imported trade records safely and reports unsafe cases.

### Milestone 7: Dividends, coupons, fees, and taxes

Approach: add the remaining movement families after the core importer has proven stable. This milestone ships dividend/coupon rows and standalone fee/tax rows through the shared batch pipeline. Embedded fees/taxes stay on the parent buy/sell/dividend rows; CSV fee/tax rows are imported as separate expense records and are not auto-attached to other movements.

Scope:

- In: dividend/coupon import, standalone fee/tax import, commit, rollback, tests.
- Out: AI classification, broker-specific reconciliation beyond deterministic mapping/rules, automatic fee/tax attachment to related rows.

Action items:

- [x] Add dividend/coupon canonical fields for asset, ex-date when available, payment date, gross amount, tax amount, net amount, currency, quantity, and dividend type.
- [x] Add fee/tax canonical fields for date, amount, currency, description, linked movement reference when available, and classification.
- [x] Document the attachment rule: embedded fee/tax values stay on the parent row; standalone fee/tax CSV rows commit as separate expense records.
- [x] Add commit handling for dividend/coupon rows.
- [x] Add commit handling for standalone fee/tax rows.
- [x] Track created records in the import batch.
- [x] Extend rollback to dividends, coupons, fees, and taxes.
- [x] Add tests for dividend/coupon totals, tax handling, linked expense behavior where applicable, and rollback.

Acceptance criteria:

- Dividend and coupon rows create records equivalent to manual dividend/coupon entries.
- Fee and tax rows follow the documented standalone-versus-attached rule consistently.
- Asset ownership and user ownership are verified server-side before commit.
- Imported dividends/coupons preserve existing statistics and income-link behavior where applicable.
- Rollback safely removes records created by the batch and reports unsafe cases.

### Milestone 8: Import history, hardening, and rollout

Approach: make the importer operationally safe after all movement families are supported. The current narrow slice covers import history and explicit rollback; the deferred hardening and rollout docs are captured in Milestone 9.

Scope:

- In: import history showing committed/`rolledBack` batches, rollback entry point, explicit confirmation and unsafe-rollback messaging, authenticated history/rollback routes, targeted regression checks for the history/rollback slice.
- Out: large-fixture/performance hardening, expanded edge-case fixture coverage, operational rollout documentation, new movement families, AI classification, unrelated UI redesign.

Action items:

- [x] Add import history showing batch status, row counts, duplicate counts, created records, failed chunks, and rollback status.
- [x] Add rollback UI guarded by explicit confirmation and clear unsafe rollback messaging.
- [x] Add large-fixture validation around 5,000 rows.
- [x] Add fixture coverage for Italian date/number formats and common bank/broker CSV quirks.
- [x] Add operational docs for supported mapping fields, import limitations, and rollback behavior.
- [ ] Run targeted tests for the history/rollback slice plus relevant TypeScript checks.
- [ ] Verify no raw CSV persistence and no forbidden broad writes.

Acceptance criteria:

- Users can inspect previous import batches and understand which ones are `committed` or `rolledBack`.
- Rollback is discoverable, explicit, and blocks or reports unsafe records.
- The history/rollback surface keeps ownership and authentication checks server-side.
- The feature can be disabled or hidden safely if rollout needs to be staged.

Release verification checklist (Milestone 8, history/rollback slice):

- [ ] `npm test -- --run __tests__/csvImportCommitRoutes.test.ts __tests__/csvImportPreviewUi.test.ts __tests__/csvImportCashflowCommitService.test.ts` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `GET /api/imports/history` requires a Firebase bearer token and returns only the authenticated user's `committed` and `rolledBack` batches.
- [ ] `/dashboard/cashflow/import-csv` shows `Storico import CSV` with batch timestamps, row counts, duplicate counts, created-record counts, and rollback status.
- [ ] The rollback confirmation flow is explicit, shows any rollback reason, and blocks unsafe rollback attempts with clear messaging.
- [ ] `POST /api/imports/[batchId]/rollback` marks the batch `rolledBack` for the authenticated owner only.

Rollback checklist (Milestone 8, history/rollback slice):

- [ ] Hide or remove the `Storico import CSV` history block and rollback action from `/dashboard/cashflow/import-csv` if the slice must be withdrawn.
- [ ] Disable or guard `GET /api/imports/history` and `POST /api/imports/[batchId]/rollback` behind the staged-release or feature flag.
- [ ] Keep existing batch records readable only through the remaining authenticated surface, or remove the endpoints entirely if the slice is being reverted.
- [ ] Re-run the history/rollback route and service tests after removal or guarding.
- [ ] No CSV data backfill or record deletion is required for this slice rollback, because the change is limited to history/rollback presentation and controls.

### Milestone 9: Release hardening and locale quirks

Approach: close the deferred release-hardening slice without expanding the importer scope. This milestone proves the importer stays stable on 5,000-row broker-style fixtures and on short-year Italian dates, then records the narrow verification and rollback steps for the release slice.

Scope:

- In: 5,000-row fixture validation, short-year Italian date parsing, apostrophe-thousands and comma-decimal number quirks, semicolon-delimited broker exports, operational release/rollback docs, targeted regression tests.
- Out: broker-specific templates, AI classification, preview virtualization, chunked server commits beyond the validated 5,000-row slice, raw CSV persistence, new data model work.

Action items:

- [x] Add a red regression test that exercises a 5,000-row broker-style CSV with `dd/MM/yy`, quoted semicolons, and apostrophe thousands separators.
- [x] Extend date normalization to accept `dd/MM/yy` while preserving strict validation for `dd/MM/yyyy`.
- [x] Align the import page's default locale with short-year Italian bank/broker date formats.
- [x] Document the release verification and rollback steps/checklists for the hardening slice.
- [x] Verify the targeted importer tests and TypeScript compilation.

Acceptance criteria:

- A 5,000-row bank/broker CSV validates without blocking rows when dates, numbers, delimiters, and quotes follow the supported Italian formats.
- Short-year Italian dates normalize consistently with the browser preview defaults.
- The import page keeps raw CSV processing in the browser and preserves the existing UI surface.
- Release and rollback steps are documented, actionable, and narrow to this slice.
- No raw CSV persistence or broader importer architecture changes are introduced.

Release verification checklist (Milestone 9, hardening/release slice):

- [x] `npm test -- --run __tests__/csvImportFoundation.test.ts __tests__/csvImportPreviewUi.test.ts` passes.
- [x] `npx tsc --noEmit` passes.
- [x] `/dashboard/cashflow/import-csv` defaults to short-year Italian date support while keeping the raw CSV browser-only copy unchanged.
- [x] A 5,000-row bank/broker fixture using `dd/MM/yy`, semicolon delimiters, quoted descriptions, and apostrophe thousands separators validates with `blockingRows === 0`.
- [x] `POST /api/imports/validate` continues to return preview-only payloads and does not write financial records.

Rollback checklist (Milestone 9, hardening/release slice):

- [x] Remove `dd/MM/yy` from the default import locale if the short-year bank/broker format needs to be withdrawn.
- [x] Revert the `dd/MM/yy` normalization branch in `lib/server/imports/normalization.ts` if the format must be disabled.
- [x] Re-run the importer foundation and preview UI tests after rollback.
- [x] No data rollback is required because this slice changes validation behavior and docs only.

### Milestone 10: Commit chunking and progress feedback

Approach: split ready commit rows on the client into fixed-size request chunks so large imports retry safely without changing the existing commit route contract. The slice keeps the rollback surface as-is and adds progress/failure copy that tells the user which chunk succeeded or failed.

Scope:

- In: client-side ready-row chunking, fixed chunk size constant, per-chunk idempotency keys, chunk payload assembly, chunk progress/failure copy in Italian, source-level regression tests.
- Out: route/service contract changes, preview virtualization or pagination, broker-specific templates, AI classification, new data model work.

Action items:

- [x] Add a fixed chunk size constant for ready commit rows.
- [x] Split the commit payload into sequential chunks before calling `POST /api/imports/commit`.
- [x] Derive each chunk idempotency key from a stable base key plus the chunk index.
- [x] Send only the current chunk rows in each request payload.
- [x] Show Italian progress, success, and failure copy that mentions the current chunk and total completed chunks.
- [x] Tighten source-level tests so they fail if the page falls back to a single bulk payload.

Acceptance criteria:

- Ready rows are split into deterministic commit chunks before the network request is sent.
- Each chunk has a stable per-chunk idempotency key so retries stay idempotent.
- Each commit request carries only the rows for that chunk, not the full ready-row set.
- The status area shows chunk progress, total created record counts, and the Italian failure copy when a chunk stops the sequence.
- Existing import history and rollback behavior remain unchanged for already committed batches.

Residual risks and future work:

- The Milestone 10 regression coverage is source-level plus route/service tests, not a Playwright/browser interaction test. Add browser-level coverage when the CSV import flow gets a stable seeded dataset or test harness.
- Preview virtualization/pagination remains deferred. Large files validate and commit in chunks, but the preview table is not yet optimized as a virtualized surface for imports beyond the validated 5,000-row slice.

Release verification checklist (Milestone 10, chunking slice):

- [x] `npm test -- --run __tests__/csvImportPreviewUi.test.ts` passes.
- [x] `npm test -- --run __tests__/csvImportPreviewUi.test.ts __tests__/csvImportCommitRoutes.test.ts __tests__/csvImportCashflowCommitService.test.ts __tests__/csvImportFoundation.test.ts` passes.
- [x] `npx tsc --noEmit --incremental false` passes.
- [x] `npx eslint __tests__/csvImportPreviewUi.test.ts app/dashboard/cashflow/import-csv/page.tsx` passes.
- [x] `git diff --check -- __tests__/csvImportPreviewUi.test.ts app/dashboard/cashflow/import-csv/page.tsx docs/csv-import-design.md docs/project-status.md` passes.
- [x] `/dashboard/cashflow/import-csv` shows chunk progress and failure copy for multi-chunk imports without changing the existing rollback surface.

Rollback checklist (Milestone 10, chunking slice):

- [ ] Remove the client-side chunk splitter, chunk-size constant, and per-chunk idempotency key helper from `/dashboard/cashflow/import-csv`.
- [ ] Restore the single-request commit payload path in the page if the chunking slice must be withdrawn.
- [ ] Keep the existing batch history and rollback routes intact; no data backfill or record deletion is required to withdraw the chunking code itself.
- [ ] If the grouped rollback surface is withdrawn, manually roll back each successful child batch from import history and stop if any batch reports unsafe rollback.
- [ ] Re-run the Milestone 10 release verification commands after reverting the page logic.

### Milestone 11: Import-run aggregation and grouped rollback

Approach: link the chunked commit batches from one logical CSV import into a grouped import run, surface child chunks in history, and provide a one-click grouped rollback path that only proceeds when every child batch is still safe. This keeps the existing per-batch rollback path available for targeted operations and adds a safer run-level path for the multi-chunk case.

Scope:

- In: `importRunId` propagation across chunked commit requests, grouped history aggregation, grouped rollback route/service, child-chunk display in the CSV page, auth and validation for the grouped rollback route, source-level route/service tests.
- Out: preview virtualization or pagination, broker-specific templates, AI classification, browser/E2E coverage, existing-record updates.

Action items:

- [x] Persist `importRunId` on chunked commit batches.
- [x] Aggregate import history into logical runs with child chunks and grouped counts.
- [x] Add `POST /api/imports/runs/[importRunId]/rollback` with bearer auth and optional `rollbackReason`.
- [x] Update the CSV import page to show grouped run history, child chunks, and grouped rollback confirmation copy.
- [x] Add route/service tests for auth, optional reason, empty run ID, invalid body, and successful grouped rollback.
- [x] Keep per-batch rollback available for individual child chunks when needed.

Acceptance criteria:

- Chunked commits from one logical CSV import share a stable `importRunId`.
- The history surface shows one grouped import run with child chunks and aggregated counts.
- Grouped rollback rolls back every safe child batch, reports partial/unsafe cases clearly, and leaves unsafe child batches untouched.
- The rollback route requires a Firebase bearer token and rejects empty run IDs and malformed payloads.
- Individual child-batch rollback remains available from history for targeted recovery.

Release verification checklist (Milestone 11, grouped rollback slice):

- [ ] `npm test -- --run __tests__/csvImportImportRunService.test.ts __tests__/csvImportImportRunRoutes.test.ts __tests__/csvImportPreviewUi.test.ts` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `POST /api/imports/runs/[importRunId]/rollback` requires a Firebase bearer token and accepts an optional `rollbackReason`.
- [ ] `GET /api/imports/runs` returns grouped import history with child chunks and aggregate counts.
- [ ] `/dashboard/cashflow/import-csv` shows `Importazioni collegate`, `Chunk collegati`, and the grouped rollback confirmation copy.
- [ ] `git diff --check -- __tests__/csvImportImportRunRoutes.test.ts __tests__/csvImportPreviewUi.test.ts app/dashboard/cashflow/import-csv/page.tsx docs/csv-import-design.md docs/project-status.md` passes.

Rollback checklist (Milestone 11, grouped rollback slice):

- [ ] Hide or remove the grouped import history and rollback UI from `/dashboard/cashflow/import-csv`.
- [ ] Disable or remove `GET /api/imports/runs` and `POST /api/imports/runs/[importRunId]/rollback`.
- [ ] Keep the chunked commit and per-batch rollback surfaces intact if only the grouped aggregation slice must be withdrawn.
- [ ] Re-run the grouped rollback route/service tests and the preview UI regression test after removal or guarding.
- [ ] No destructive data backfill is required because grouped history metadata is additive and the underlying child batches remain valid history.

## Risks and mitigations

### Dirty data from ambiguous CSVs

Mitigation: mandatory preview, confidence display, validation errors, bulk edit, and no silent entity creation.

### Duplicate imports

Mitigation: source fingerprint, dedupe keys, idempotency keys, and import batch history.

### Rollback complexity

Mitigation: first release only creates new records and rolls back those records. Existing-record updates are out of scope.

### Performance with 5,000 rows

Mitigation: client-side parsing, paginated or virtualized preview table, chunked commit requests.

### Privacy

Mitigation: do not persist raw CSV files; persist only normalized rows after user confirmation and only as needed to create actual records/import metadata.

### Scope creep

Mitigation: design supports all movement types, but implementation proceeds by narrow vertical slices.

## Testing strategy

- Unit tests for CSV parsing, locale normalization, mapping, classification, and dedupe key generation.
- Service/use-case tests for import commit and rollback.
- API route tests for authentication, ownership, idempotency, and validation errors.
- Regression tests ensuring transfers do not affect income/expense KPIs.
- Regression tests ensuring investment operations are not modeled as ordinary expenses/income.
- Rollback tests for full rollback, partial unsafe rollback, and duplicate rollback attempts.

## Open questions

- Should import batch history be visible in Cashflow, Settings, or a dedicated Import page?
- Should rollback be allowed after imported rows are manually edited, or blocked strictly?
- Should AI-assisted classification be offered later as an optional layer on top of deterministic rules?

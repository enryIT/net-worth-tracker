# CSV Import Design

## Status

Proposed design. No implementation has been completed yet.

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
- [ ] Add assisted linking/creation flows for missing assets, accounts, categories, and subcategories without silent creation.

Acceptance criteria:

- The user can move from CSV upload to mapped preview without writing financial records.
- Preview displays row-level issues and classification reasons in Italian user-facing text.
- Rows with blocking errors cannot be marked ready for commit.
- Missing entities require explicit user confirmation before being created or linked.
- Bulk edit updates selected rows consistently and recomputes validation/classification where needed.
- UI follows existing layout/styling patterns and uses `desktop:` rather than `lg:`.

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

- [ ] Add transfer-specific canonical fields for source account, destination account, amount, date, and description.
- [ ] Validate source and destination account references before commit.
- [ ] Add transfer commit handling to the existing import batch pipeline.
- [ ] Track transfer records in `importBatch.createdRecords`.
- [ ] Extend rollback to transfer records.
- [ ] Add regression tests proving imported transfers do not change income, expenses, or savings KPIs.

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

- [ ] Add investment-operation canonical fields for side, asset, quantity, unit price, currency, fees, taxes, and optional cash account.
- [ ] Validate asset links by confirmed asset ID, ticker, or ISIN resolution.
- [ ] Add buy/sell commit handling through the import batch pipeline.
- [ ] Preserve existing weighted-average-cost, realized gain, tax, and optional cash-account impact semantics.
- [ ] Track created investment operation records in the batch.
- [ ] Extend rollback to investment operations and related imported cash impacts when safe.
- [ ] Add tests ensuring imported trades are not modeled as cashflow expenses/income.

Acceptance criteria:

- Buy/sell rows create investment operations equivalent to manual entries.
- Quantity, unit price, fees, and taxes are validated before commit.
- Imported trades do not pollute ordinary income/expense KPIs.
- Optional cash-account impact matches existing manual trade behavior.
- Rollback handles imported trade records safely and reports unsafe cases.

### Milestone 7: Dividends, coupons, fees, and taxes

Approach: add the remaining movement families after the core importer has proven stable. This milestone should explicitly decide whether fees/taxes are standalone rows or attached to related movements when the CSV structure allows it.

Scope:

- In: dividend/coupon import, standalone fee/tax import, optional linking of fee/tax fields to related rows, commit, rollback, tests.
- Out: AI classification and broker-specific reconciliation beyond deterministic mapping/rules.

Action items:

- [ ] Add dividend/coupon canonical fields for asset, ex-date when available, payment date, gross amount, tax amount, net amount, currency, quantity, and dividend type.
- [ ] Add fee/tax canonical fields for date, amount, currency, description, linked movement reference when available, and classification.
- [ ] Decide and document attachment rules for fees/taxes embedded in buy/sell/dividend rows versus standalone rows.
- [ ] Add commit handling for dividend/coupon rows.
- [ ] Add commit handling for standalone fee/tax rows.
- [ ] Track created records in the import batch.
- [ ] Extend rollback to dividends, coupons, fees, and taxes.
- [ ] Add tests for dividend/coupon totals, tax handling, linked expense behavior where applicable, and rollback.

Acceptance criteria:

- Dividend and coupon rows create records equivalent to manual dividend/coupon entries.
- Fee and tax rows follow the documented standalone-versus-attached rule consistently.
- Asset ownership and user ownership are verified server-side before commit.
- Imported dividends/coupons preserve existing statistics and income-link behavior where applicable.
- Rollback safely removes records created by the batch and reports unsafe cases.

### Milestone 8: Import history, hardening, and rollout

Approach: make the importer operationally safe after all movement families are supported. This milestone focuses on auditability, performance, error recovery, and release readiness.

Scope:

- In: import history UI, rollback entry point, performance validation, edge-case fixtures, documentation updates, broad regression checks.
- Out: new movement families, AI classification, unrelated UI redesign.

Action items:

- [ ] Add import history showing batch status, row counts, duplicate counts, created records, failed chunks, and rollback status.
- [ ] Add rollback UI guarded by explicit confirmation and clear unsafe rollback messaging.
- [ ] Add large-fixture validation around 5,000 rows.
- [ ] Add fixture coverage for Italian date/number formats and common bank/broker CSV quirks.
- [ ] Add operational docs for supported mapping fields, import limitations, and rollback behavior.
- [ ] Run targeted tests for all import use-cases plus relevant cashflow, transfer, investment, dividend, and TypeScript checks.
- [ ] Verify no raw CSV persistence and no forbidden broad writes.

Acceptance criteria:

- Users can inspect previous import batches and understand what was created.
- Rollback is discoverable, explicit, and blocks or reports unsafe records.
- A 5,000-row import remains usable in preview and commits in safe chunks.
- Documentation explains mapping, dedupe, rollback, and limitations clearly.
- Relevant tests pass, TypeScript passes, and `git diff --check` passes before release.
- The feature can be disabled or hidden safely if rollout needs to be staged.

## Risks and mitigations

### Dirty data from ambiguous CSVs

Mitigation: mandatory preview, confidence display, validation errors, bulk edit, and no silent entity creation.

### Duplicate imports

Mitigation: source fingerprint, dedupe keys, idempotency keys, and import batch history.

### Rollback complexity

Mitigation: first release only creates new records and rolls back those records. Existing-record updates are out of scope.

### Performance with 5,000 rows

Mitigation: client-side parsing, paginated or virtualized preview table, chunked server commits.

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

- Should imported fee/tax rows be standalone records by default, or attached to related investment/dividend rows when possible?
- Should import batch history be visible in Cashflow, Settings, or a dedicated Import page?
- Should rollback be allowed after imported rows are manually edited, or blocked strictly?
- Should AI-assisted classification be offered later as an optional layer on top of deterministic rules?

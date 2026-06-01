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

## Suggested implementation slices

### Slice 1: Pure import foundation

- CSV parsing adapter.
- Column mapping model.
- Locale/date/number normalization.
- `NormalizedImportRow` types.
- Dedupe key generation helpers.
- Basic classification rules.
- Unit tests for parser, normalization, and classifier.

No database writes in this slice.

### Slice 2: Presets

- `csvImportPreset` server model/service.
- Authenticated preset API routes.
- Tests for ownership and validation.
- Minimal UI for save/load preset can come later if needed.

### Slice 3: Preview UI

- Import wizard shell.
- Mapping screen.
- Preview table with filters.
- Inline correction for movement kind and key fields.
- Bulk edit for repeated fixes.

### Slice 4: Cashflow commit and rollback

- Commit ordinary income/expense rows.
- Create `importBatch`.
- Track created records.
- Rollback imported cashflow records.
- Targeted route/use-case tests.

### Slice 5: Transfers

- Add transfer row validation and commit.
- Preserve existing semantics: internal transfers do not affect income/expense savings metrics.
- Extend rollback.

### Slice 6: Investment operations

- Add buy/sell operation import.
- Validate asset link, quantity, unit price, fees, taxes, side.
- Preserve existing investment operation semantics.

### Slice 7: Dividends, coupons, fees, and taxes

- Add dividend/coupon import.
- Add fee/tax handling.
- Decide whether fees/taxes are standalone movements or attached to buy/sell/dividend rows based on mapped CSV structure.

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

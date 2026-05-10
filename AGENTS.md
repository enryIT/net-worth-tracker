# AI Agent Guidelines - Net Worth Tracker

This is the shared entrypoint for Codex, Claude Code, and Caliber-generated
agent context. Keep this file concise. Durable project knowledge lives in:

- [docs/agent-memory.md](docs/agent-memory.md): detailed operational rules,
  recurring pitfalls, UI conventions, assistant patterns, and test notes.
- [docs/project-status.md](docs/project-status.md): architecture snapshot,
  feature status, integrations, and known issues.
- [.claude/rules](.claude/rules): Claude Code rule files that should mirror the
  same high-level contract used by Codex.

When adding new long-lived guidance, update the docs above first, then keep only
the short, high-signal summary here.

## Source Of Truth

Claude Code and Codex must follow the same project rules.

- Treat `AGENTS.md` as the short shared operational entrypoint for
  implementation work, tests, localization, git hygiene, and recurring pitfalls.
- Treat `CLAUDE.md` as Claude Code's short project entrypoint.
- Read `docs/agent-memory.md` for the full durable operational memory.
- Read `docs/project-status.md` for detailed architecture and current-product
  status.
- When a change alters project conventions, update `docs/agent-memory.md`
  first, then keep `AGENTS.md` as a concise summary.
- When a change alters current architecture or active features, update
  `docs/project-status.md` first, then keep `CLAUDE.md` as a concise summary.
- If files conflict, prefer `AGENTS.md` / `docs/agent-memory.md` for how to
  work and `CLAUDE.md` / `docs/project-status.md` for what currently exists.

## Non-Negotiables

- User-facing text is Italian. Code comments are English only.
- Use `desktop:` for the 1440px Tailwind breakpoint; do not introduce `lg:`.
- Use `formatCurrency()`, `formatDate()`, and Italy timezone helpers from
  `dateHelpers.ts`. Do not group domain data with raw `Date.getMonth()` or
  `Date.getFullYear()`.
- Keep settings fields synchronized across type definition, `getSettings()`,
  and `setSettings()`. Feature toggles live in `AssetAllocationSettings`.
- Prefer `useMemo` for derived React data. Avoid `useEffect + setState` for
  computed collections.
- Do not revert user changes or unrelated dirty files. Work only on the files
  needed for the current request.
- Private App Router API routes using Firebase Admin must authenticate
  server-side and bind operations to the verified Firebase UID.

## Household Scope Contract

Household ownership mode is optional. When disabled, behavior must stay
single-user by default. When enabled, views can be scoped by all data, ownership
profile, or participant.

Important implementation rules:

- `useHouseholdScopeFilter()` returns a scope object that must stay
  referentially stable for the selected key.
- Do not inline fresh `{ kind, id }` scope objects into dependency arrays.
- Components fed by scoped collections must call hooks before empty-data
  returns; scoped profiles can legitimately produce zero rows.
- Snapshot/report/PDF/export logic must preserve saved split metadata instead
  of recalculating historical ownership from today's profile shape.

## UI And Copy

- Navigation taxonomy: `Panoramica`, `Patrimonio`, `Allocazione`,
  `Rendimenti`, `Storico`, `Impostazioni`.
- Keep `Hall of Fame`, `FIRE e Simulazioni`, `Cashflow`, and `Assistente AI`
  as established labels.
- Use `Sottocategoria`, not `Sotto-categoria`.
- In JSX with inline tags, preserve spaces explicitly:
  `testo {' '}<strong>valore</strong>{' '} testo`.
- In `.tsx` Italian strings, avoid typographic apostrophes that can trigger
  `TS1127`; prefer ASCII apostrophes or double-quoted strings.

## Verification

Use the narrowest relevant test first, then broaden based on blast radius.

```powershell
npm.cmd test -- --run __tests__/householdUtils.test.ts
npm.cmd test
npx tsc --noEmit
npm.cmd run build
```

For docs-only changes, at minimum run `git diff --check`.

## Caliber Policy

Caliber may shorten `AGENTS.md` and `CLAUDE.md`. That is acceptable only because
the detailed content is stored in `docs/agent-memory.md` and
`docs/project-status.md`.

Do not delete durable guidance from the docs during a Caliber refresh. If
Caliber proposes a shorter entrypoint, preserve links back to the detailed docs.

`caliber refresh` can send repository context to an external model. Run it only
with explicit user approval and review the resulting diff before committing.

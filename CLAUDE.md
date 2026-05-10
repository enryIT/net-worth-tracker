# CLAUDE.md - Net Worth Tracker

This file is Claude Code's short project entrypoint. Operational implementation
rules are shared with Codex in [AGENTS.md](AGENTS.md). Detailed context lives in:

- [docs/project-status.md](docs/project-status.md): full architecture and
  product status history.
- [docs/agent-memory.md](docs/agent-memory.md): detailed engineering rules,
  recurring pitfalls, and verification notes.
- [.claude/rules](.claude/rules): Claude-specific rule files kept aligned with
  the shared agent contract.

Keep this file compact so Caliber can maintain it without truncating durable
project knowledge.

## Project Overview

Net Worth Tracker is a Next.js app for Italian investors to track net worth,
assets, cashflow, dividends, performance metrics, FIRE planning, and AI-assisted
analysis with Firebase.

## Current Stack

- Next.js 16, React 19, TypeScript 5, Tailwind v4
- Firebase client/admin SDK, Firestore security rules
- Vitest, React Query, Recharts, Framer Motion
- Yahoo Finance, Borsa Italiana scraping, Frankfurter FX API
- Anthropic-powered Assistente AI

## Current Focus

Household ownership mode is active and optional. It supports participants,
ownership profiles, split attribution, internal transfer ownership,
attribution-aware budget/reporting, compensation reports, and saved snapshot
split metadata.

Main household files:

- `types/household.ts`
- `lib/utils/householdUtils.ts`
- `lib/hooks/useHouseholdScopeFilter.ts`
- `components/household/HouseholdScopeSelect.tsx`
- `components/cashflow/*`
- `components/pdf/PDFExportDialog.tsx`
- `lib/services/pdfDataService.ts`

## Architecture Snapshot

- App Router protected pages under `app/dashboard/*`
- Service layer in `lib/services/*`
- Shared utilities in `lib/utils/*`
- React Query for caching and invalidation
- Italy timezone helpers in `lib/utils/dateHelpers.ts`

## Verification

```powershell
npm.cmd test -- --run __tests__/householdUtils.test.ts
npm.cmd test
npx tsc --noEmit
npm.cmd run build
```

For docs-only edits, run `git diff --check`.

# Caliber Docs Policy

Caliber may shorten `AGENTS.md` and `CLAUDE.md`; that is acceptable only if the
durable details remain in `docs/agent-memory.md` and `docs/project-status.md`.

- Do not delete long-lived rules from the docs during a refresh.
- If Caliber rewrites entrypoints, preserve links back to the detailed docs.
- Prefer adding new detailed guidance to `docs/agent-memory.md` or
  `docs/project-status.md`, then summarize only the critical points in the
  entrypoint files.
- `caliber refresh` can send repository context to an external model. Run it
  only with explicit user approval and review the resulting diff before commit.

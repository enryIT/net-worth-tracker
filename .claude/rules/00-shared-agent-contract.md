# Shared Agent Contract

Claude Code and Codex must follow the same project rules.

- Treat `AGENTS.md` as the short shared operational entrypoint for implementation work, tests, localization, git hygiene, and recurring pitfalls.
- Treat `CLAUDE.md` as Claude Code's short project entrypoint.
- Read `docs/agent-memory.md` for the full durable operational memory.
- Read `docs/project-status.md` for detailed architecture and current-product status.
- When a change alters project conventions, update `docs/agent-memory.md` first, then keep `AGENTS.md` as a concise summary.
- When a change alters current architecture or active features, update `docs/project-status.md` first, then keep `CLAUDE.md` as a concise summary.
- If files conflict, prefer `AGENTS.md` / `docs/agent-memory.md` for how to work and `CLAUDE.md` / `docs/project-status.md` for what currently exists.
- Keep user-facing UI text in Italian and code/comments in English.

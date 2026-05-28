# Blocked validation handoff pattern

Use this when a required validation gate cannot complete because of the execution environment, but targeted tests and code review for the slice are otherwise clean.

## Pattern

1. Preserve the gate as mandatory. Do not silently downgrade it because the environment failed.
2. Retry once with a reasonable, non-invasive adjustment if available (for example, a documented tool flag or memory setting).
3. If the gate still cannot complete, document the blocker in the project handoff/status file with:
   - exact command;
   - exit code;
   - important output;
   - relevant environment facts that explain why diagnostics are unavailable;
   - explicit instruction that the slice must not be committed or shipped until the gate passes elsewhere.
4. Run and record the narrowest passing targeted tests for the touched area.
5. Run cheap deterministic checks that do not depend on the blocked resource, such as whitespace/diff checks on touched files.
6. Review the working tree and staged diff. Leave the work unstaged if the project's rules require all gates to pass before commit.
7. In the final response, say clearly: no commit/push happened because the required gate did not pass.

## What not to save as a rule

Do not encode the specific failing machine as durable truth. Memory pressure, missing swap, unavailable binaries, and local setup failures are environment facts, not permanent properties of the project or tools.

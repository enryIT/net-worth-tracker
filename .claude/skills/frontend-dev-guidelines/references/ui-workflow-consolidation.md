# UI Workflow Consolidation Reference

Use this when separate UI flows are being collapsed into one workflow, such as turning dedicated tabs/forms into a single movement, transaction, or activity entrypoint.

## Durable pattern

1. Add a RED regression test before implementation.
   - Source-level tests are acceptable when the current project has limited component-render tests and the regression is structural: imports removed, components no longer embedded, a new unified entrypoint exists, type-specific fields remain reachable.
   - Test both negative and positive expectations: old split entrypoints are gone, the unified entrypoint and dynamic fields exist.
2. Preserve the existing domain services instead of rewriting persistence in the UI.
   - A unified form can dispatch to existing create/update/delete services based on a discriminated movement kind.
   - Keep specialized domain semantics in the existing service layer: cashflow sign rules, investment quantity/average-cost updates, transfer neutrality, cache invalidation.
3. Define a small UI-level discriminated model.
   - Example: `kind: 'expense' | 'investment' | 'transfer'` with a shared list shape for title, subtitle, date, amount, and source.
   - Keep type-specific fields in the source object or in a dynamic dialog section, not in a lossy shared type.
4. Use one visible entrypoint and one visible list.
   - A single `Nuovo movimento` button can show movement-type cards, then render only fields for that selected type.
   - The unified list should include edit/delete actions for every kind and route each action to the correct existing handler/service.
5. Be honest about partial unification.
   - If an existing complex dialog is reused internally for one type, state that the UX entrypoint is unified but the component implementation still delegates to the legacy dialog.
   - Do not claim a single physical form component unless all branches are actually inside it.

## Pitfalls

- Do not leave old embedded forms under a "special types" section after claiming a full UX unification.
- Do not split history tables by type if the stated goal is one tracking list.
- Do not flatten specialized fields into generic fields; investment and transfer attributes must remain type-specific.
- Avoid broad backend rewrites unless the service contracts cannot support the unified UI.
- If repo-wide lint/build failures are pre-existing or environment-driven, still run targeted lint/typecheck/tests for the files touched and report the broader blocker separately.

## Verification checklist

- New regression test failed before implementation for the expected structural reason.
- Targeted tests pass for the new unified workflow and nearby domain services.
- TypeScript passes.
- Targeted eslint on touched files passes when possible.
- `git diff --check` passes for touched files.
- Build result is reported separately; environment credential failures should not be represented as feature regressions.

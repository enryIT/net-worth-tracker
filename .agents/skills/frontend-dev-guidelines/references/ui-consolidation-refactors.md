# UI Consolidation Refactors

Use this reference when a user asks to merge multiple UI surfaces (tabs, menus, forms, or lists) into one workflow while preserving type-specific behavior.

## Proven workflow

1. Define the target interaction model first:
   - one user-facing entrypoint (for example, `Nuovo movimento`);
   - a type picker for the variants;
   - one visible list/table for all variants;
   - type-specific fields remain conditional, not deleted.
2. Add RED regression tests before implementation. Source-level tests are acceptable for navigation/form-reachability refactors when component rendering setup would be excessive. Guard all of these:
   - old tab/menu values are absent from the page navigation source of truth;
   - old embedded/dedicated forms are not rendered from the parent surface;
   - the new entrypoint string exists;
   - the new unified dialog/component exists;
   - type-specific field identifiers still exist for each variant;
   - edit/delete handlers cover every movement kind.
3. Prefer a parent-level adapter/dialog for the consolidated flow before rewriting mature specialist forms. If one variant has a large existing dialog with categories, recurrence, installments, attribution, and validation, route that variant through the existing dialog while making the entrypoint unified. This gets the UX consolidation without a high-risk form rewrite.
4. Build a discriminated union for the list model, e.g. `{ kind: 'expense' | 'investment' | 'transfer', source, amount, title, subtitle }`, and centralize list sorting/filtering over that model.
5. Keep KPI math scoped to the original semantic domain. Example: investments/transfers can appear in the unified movement list while income/expense KPIs continue using ordinary cashflow records only.
6. Revert transitional child-component edits that are no longer used before staging. It is common to add `embedded` props as an intermediate step, then replace embedding with a parent-level dialog. Do not leave unused child edits in the commit.
7. Stage only files in the final slice; never include unrelated generated skill/config directories.

## Verification checklist

Run, at minimum:

```bash
npm test -- --run <new-regression-test> <nearby-regression-tests>
npx eslint <touched-ui-files> <new-test-files>
npx tsc --noEmit --incremental false
git diff --check -- <touched-files>
```

If `npm run build` fails for environment credentials after compile and TypeScript pass, report it as a build environment blocker, not as proof the UI slice is broken. Do not hide the failure.
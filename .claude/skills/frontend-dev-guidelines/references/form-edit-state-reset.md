# Edit-mode form state reset pitfall

## Trigger

Use this when a user reports that a form button such as `Save`, `Salva modifiche`, or `Update` does nothing in edit mode, especially after the same dialog supports both create and edit flows with conditional sections.

## Symptom

The click reaches the submit button, but nothing visible happens:

- no toast
- no network call
- no console error from the submit handler
- modal stays open

Often the real failure occurs before the business submit handler because the form library blocks submission during validation.

## Root cause pattern

React Hook Form and similar form libraries can retain values for registered fields even after their controls are hidden by conditional rendering. If a create flow previously enabled optional sections such as recurrence, installments, linked assets, advanced filters, or type-specific fields, those stale hidden values can survive into edit mode unless `reset()` explicitly clears or repopulates them.

Schema validators then evaluate hidden values and can reject the form before `onSubmit` runs. From the user perspective this looks like a dead button.

## Debug sequence

1. Add a RED regression test before editing production code.
2. Inspect the edit-mode `reset()` branch, not only the button and `onSubmit` handler.
3. Compare every conditional field in the schema/default values against the edit reset payload.
4. Include both boolean flags and companion fields:
   - `isRecurring`, `recurringDay`, `recurringMonths`
   - `isInstallment`, `installmentMode`, `installmentCount`, `installmentTotalAmount`, `installmentAmounts`, `installmentStartDate`
   - linked IDs and sentinel values such as `__none__`
   - cost-center, attribution, or ownership fields
5. Reset hidden create-only sections to safe defaults in edit mode unless the edited entity truly owns those fields.
6. Run the narrow regression test, related form-flow tests, TypeScript, and the full suite when feasible.

## Good regression shape

For projects without component-testing infrastructure, a source-level guard is still better than no guard:

```ts
const source = readRepoFile('components/expenses/ExpenseDialog.tsx');
const editResetMatch = source.match(/if \(expense\) \{\s*reset\(\{([\s\S]*?)\}\);/);

expect(editResetMatch?.[1]).toContain('isRecurring: expense.isRecurring || false');
expect(editResetMatch?.[1]).toContain('isInstallment: expense.isInstallment || false');
expect(editResetMatch?.[1]).toContain("installmentMode: 'auto'");
expect(editResetMatch?.[1]).toContain('installmentCount: expense.installmentTotal || 2');
```

Prefer real interaction tests when the project already has Testing Library/Playwright coverage.

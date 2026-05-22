import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('expense UI Firebase boundary', () => {
  it.each([
    'components/expenses/ExpenseCard.tsx',
    'components/expenses/ExpenseTable.tsx',
    'components/expenses/ExpenseDialog.tsx',
  ])('%s does not import Firebase runtime modules for date handling', (filePath) => {
    const source = readFileSync(filePath, 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

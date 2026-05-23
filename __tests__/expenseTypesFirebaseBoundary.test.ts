import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('expense shared type Firebase boundary', () => {
  it('does not import Firebase runtime modules from shared expense types', () => {
    const source = readFileSync(join(process.cwd(), 'types/expenses.ts'), 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

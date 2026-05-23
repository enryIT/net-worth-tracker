import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('budget shared type Firebase boundary', () => {
  it('does not import Firebase runtime modules from shared budget types', () => {
    const source = readFileSync(join(process.cwd(), 'types/budget.ts'), 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

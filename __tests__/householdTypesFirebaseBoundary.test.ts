import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('household shared type Firebase boundary', () => {
  it('does not import Firebase runtime modules from shared household types', () => {
    const source = readFileSync('types/household.ts', 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

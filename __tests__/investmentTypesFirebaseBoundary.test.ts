import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('investment shared types Firebase boundary', () => {
  it('does not import Firebase provider modules in investment shared types', () => {
    const source = readFileSync('types/investments.ts', 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

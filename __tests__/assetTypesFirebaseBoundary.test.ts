import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('asset shared types Firebase boundary', () => {
  it('keeps shared asset types free of Firebase runtime imports', () => {
    const source = readFileSync('types/assets.ts', 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('goal type Firebase boundary', () => {
  it('keeps shared goal types free of Firebase runtime imports', () => {
    const source = readFileSync('types/goals.ts', 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });

  it('keeps pure goal service fixtures free of Firebase timestamp imports', () => {
    const source = readFileSync('__tests__/goalService.test.ts', 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

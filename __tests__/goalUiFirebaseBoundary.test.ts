import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('goal UI Firebase boundary', () => {
  it('keeps GoalFormDialog free of Firebase runtime imports for timestamp creation', () => {
    const source = readFileSync('components/goals/GoalFormDialog.tsx', 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

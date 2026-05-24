import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenFirebaseImport = /from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/;

describe('hall of fame shared type Firebase boundary', () => {
  it('does not import Firebase runtime modules from shared hall of fame types', () => {
    const source = readFileSync(join(process.cwd(), 'types/hall-of-fame.ts'), 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });
});

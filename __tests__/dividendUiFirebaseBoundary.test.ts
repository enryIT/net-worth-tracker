import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dividend UI Firebase boundary', () => {
  it('keeps DividendTable free of Firebase runtime imports', () => {
    const source = readFileSync('components/dividends/DividendTable.tsx', 'utf8');

    expect(source).not.toMatch(/from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/);
  });

  it('keeps DividendDialog date handling free of Firebase runtime imports', () => {
    const source = readFileSync('components/dividends/DividendDialog.tsx', 'utf8');

    expect(source).not.toMatch(/from ['"]firebase\/firestore['"]|from ['"]@\/lib\/firebase\/config['"]/);
  });
});

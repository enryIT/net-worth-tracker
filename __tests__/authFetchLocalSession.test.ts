import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const forbiddenFirebaseImport = /from ['"]@\/lib\/firebase\/config['"]|from ['"]firebase\/auth['"]|from ['"]firebase\/firestore['"]/;

describe('authenticatedFetch local session boundary', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not import Firebase runtime dependencies', () => {
    const source = readFileSync(join(process.cwd(), 'lib/utils/authFetch.ts'), 'utf8');

    expect(source).not.toMatch(forbiddenFirebaseImport);
  });

  it('uses the local cookie session without adding a Firebase bearer token', async () => {
    const { authenticatedFetch } = await import('@/lib/utils/authFetch');

    const response = await authenticatedFetch('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
    });

    expect(response.status).toBe(204);
    expect(global.fetch).toHaveBeenCalledWith('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: 'dark' }),
      credentials: 'same-origin',
    });
  });
});

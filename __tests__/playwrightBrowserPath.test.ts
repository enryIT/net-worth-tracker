import { describe, expect, it } from 'vitest';

async function loadResolver() {
  return import('../e2e/playwright-browser-path.mjs');
}

describe('resolvePlaywrightChromiumExecutablePath', () => {
  it('prefers PLAYWRIGHT_CHROME_EXECUTABLE_PATH', async () => {
    const { resolvePlaywrightChromiumExecutablePath } = await loadResolver();

    expect(
      resolvePlaywrightChromiumExecutablePath({
        PLAYWRIGHT_CHROME_EXECUTABLE_PATH: '  /opt/chrome-for-testing/chrome  ',
        CHROME_BIN: '/usr/bin/google-chrome',
      })
    ).toBe('/opt/chrome-for-testing/chrome');
  });

  it('falls back to CHROME_BIN', async () => {
    const { resolvePlaywrightChromiumExecutablePath } = await loadResolver();

    expect(
      resolvePlaywrightChromiumExecutablePath({
        CHROME_BIN: '  /usr/bin/google-chrome  ',
      })
    ).toBe('/usr/bin/google-chrome');
  });

  it('returns undefined when no executable path is configured', async () => {
    const { resolvePlaywrightChromiumExecutablePath } = await loadResolver();

    expect(resolvePlaywrightChromiumExecutablePath({})).toBeUndefined();
  });
});

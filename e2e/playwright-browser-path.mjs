const EXECUTABLE_PATH_ENV_VARS = [
  'PLAYWRIGHT_CHROME_EXECUTABLE_PATH',
  'CHROME_BIN',
];

/**
 * Resolve a Playwright-compatible browser executable path from env variables.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | undefined}
 */
export function resolvePlaywrightChromiumExecutablePath(env = process.env) {
  for (const envVar of EXECUTABLE_PATH_ENV_VARS) {
    const executablePath = env[envVar];
    if (typeof executablePath === 'string' && executablePath.trim()) {
      return executablePath.trim();
    }
  }

  return undefined;
}

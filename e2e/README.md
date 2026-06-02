# E2E Runner

Run the isolated browser regression with Playwright:

```bash
npm run test:e2e -- unified-movement-investment-edit.spec.mjs
```

If Playwright's bundled browsers are unavailable on Ubuntu 26.04, install
Chrome for Testing with Puppeteer Browsers and point Playwright at the
downloaded binary:

```bash
npx @puppeteer/browsers install chrome@stable --path "$HOME/.cache/puppeteer-browsers"
export PLAYWRIGHT_CHROME_EXECUTABLE_PATH="$(find "$HOME/.cache/puppeteer-browsers/chrome" -path '*/chrome-linux64/chrome' -type f | sort -V | tail -1)"
npm run test:e2e -- unified-movement-investment-edit.spec.mjs
```

The spec uses Playwright's isolated browser context, user-facing locators, request
route mocking, and no arbitrary sleeps.

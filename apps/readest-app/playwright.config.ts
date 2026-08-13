import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright web e2e lane.
 *
 * This suite drives the Next.js *web* build (`pnpm dev-web`) in a real browser.
 * It is complementary to — not a replacement for — the WebdriverIO suite
 * (`e2e/app.e2e.mjs`, run via `pnpm test:e2e`), which drives the Tauri shell.
 *
 *   - Specs:        e2e/tests/**\/*.spec.ts
 *   - Page objects: e2e/pages
 *   - Fixtures:     e2e/fixtures
 *
 * Tests run unauthenticated against a fresh browser context, so each test
 * starts from an isolated, empty local library.
 */
const PORT = Number(process.env.BABELLEAF_WEB_E2E_PORT || 3000);
const externalWebServer = process.env.BABELLEAF_E2E_EXTERNAL_SERVER === '1';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Tests are isolated (a fresh browser context per test), so they run in
  // parallel. `test:e2e:web:headed` overrides this to 1 to stay watchable.
  workers: 4,
  // Always write the HTML report so `pnpm test:e2e:web:report` can open it.
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The host machine may advertise zh-CN, while this lane asserts the
    // stable English accessibility labels. Product locale behavior is tested
    // separately; the browser harness must not depend on host locale.
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalWebServer
    ? undefined
    : {
        // CI runs against the exported production build (`pnpm build-web`
        // runs first as a separate CI step). The repository-owned static
        // server adds the COOP/COEP headers required by the local WASM readers.
        command: process.env.CI ? 'node scripts/serve-web.mjs' : 'pnpm dev-web',
        port: PORT,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

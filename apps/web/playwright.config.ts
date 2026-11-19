import { pathToFileURL } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { egressLog, NO_EGRESS_PRELOAD } from './tests/e2e/support/egress.ts';

// TESTS §6. Production projects run against E2E_BASE_URL; every other project runs against `next start`
// (production build) on localhost. E2E_PORT lets parallel worktrees run their own server side by side (default 3000).
// E2E_TARGET=zero-env (INFRA-CI §2.1 `demo-zero-env`, run under `env -i`): the server starts with a preload that
// refuses and logs every connection to a non-loopback host, and the global teardown fails the run if any happened;
// the browser half is the network guard of the demo-* projects (tests/e2e/fixtures.ts).
const productionRun = (process.env.E2E_BASE_URL ?? '') !== '';
const zeroEnv = process.env.E2E_TARGET === 'zero-env';
const port = process.env.E2E_PORT ?? '3000';
const baseURL = productionRun ? process.env.E2E_BASE_URL : `http://localhost:${port}`;

// TESTS §7.3: no silent retry, except in the production-* projects (real network).
const productionRetries = 1;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  ...(zeroEnv ? { globalSetup: './tests/e2e/support/zero-env-setup.ts' } : {}),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Network guard (fixtures.ts): any request to a non-local host fails the test.
    { name: 'demo-chromium', testDir: './tests/e2e/demo', use: { ...devices['Desktop Chrome'] } },
    { name: 'demo-mobile', testDir: './tests/e2e/demo', use: { ...devices['Pixel 7'] } },
    { name: 'app-chromium', testDir: './tests/e2e/app', use: { ...devices['Desktop Chrome'] } },
    { name: 'security', testDir: './tests/e2e/security', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'production-chromium',
      testDir: './tests/e2e/production',
      retries: productionRetries,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // TESTS §6.4 P6: Safari on an iPhone 15 runs the same production checks (SSE, fonts).
      name: 'production-webkit-mobile',
      testDir: './tests/e2e/production',
      retries: productionRetries,
      use: { ...devices['iPhone 15'] },
    },
  ],
  ...(productionRun
    ? {}
    : {
        webServer: {
          // Zero env: `next start` directly (no pnpm in between), with the egress preload.
          command: zeroEnv
            ? `node ./node_modules/next/dist/bin/next start --port ${port}`
            : `pnpm start --port ${port}`,
          url: `http://localhost:${port}/api/health`,
          reuseExistingServer: !process.env.CI && !zeroEnv,
          timeout: 120_000,
          ...(zeroEnv
            ? {
                env: {
                  NODE_OPTIONS: `--import=${pathToFileURL(NO_EGRESS_PRELOAD).href}`,
                  E2E_EGRESS_LOG: egressLog(),
                },
              }
            : {}),
        },
      }),
});

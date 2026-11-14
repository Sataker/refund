import { defineConfig, devices } from '@playwright/test';

// TESTS §6. Production projects run against E2E_BASE_URL; every other project
// runs against `next start` (production build) on localhost:3000.
const productionRun = (process.env.E2E_BASE_URL ?? '') !== '';
const baseURL = productionRun ? process.env.E2E_BASE_URL : 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'demo-chromium', testDir: './tests/e2e/demo', use: { ...devices['Desktop Chrome'] } },
    { name: 'demo-mobile', testDir: './tests/e2e/demo', use: { ...devices['Pixel 7'] } },
    { name: 'app-chromium', testDir: './tests/e2e/app', use: { ...devices['Desktop Chrome'] } },
    { name: 'security', testDir: './tests/e2e/security', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'production-chromium',
      testDir: './tests/e2e/production',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'production-webkit-mobile',
      testDir: './tests/e2e/production',
      use: { ...devices['iPhone 15'] },
    },
  ],
  ...(productionRun
    ? {}
    : {
        webServer: {
          command: 'pnpm start',
          url: 'http://localhost:3000/api/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});

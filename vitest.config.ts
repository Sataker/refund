import { defineConfig } from 'vitest/config';

// *.live.test.ts only run with LIVE=1 (never in CI). TESTS §1.
const live = process.env.LIVE === '1';

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**', 'apps/web/src/**'],
      // TESTS §7.1. @refund/ai/guards (95/90) enters with E10.
      thresholds: {
        'packages/engine/src/**': { lines: 95, branches: 90 },
        'packages/pipeline/src/**': { lines: 85, branches: 80 },
        'apps/web/src/server/**': { lines: 70, branches: 60 },
        'packages/sources/src/**/whitelist.ts': { lines: 90, branches: 85 },
        'packages/sources/src/pii/**': { lines: 90, branches: 85 },
        'packages/sources/src/cnpj/validate.ts': { lines: 90, branches: 85 },
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.ts'],
          exclude: [
            '**/node_modules/**',
            '**/golden/**',
            '**/properties/**',
            '**/invariants/**',
            'packages/db/test/**', // integration project (PGlite, forks, 20 s timeout)
            ...(live ? [] : ['**/*.live.test.ts']),
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'golden',
          include: [
            'packages/engine/test/golden/**/*.test.ts',
            'packages/engine/test/properties/**/*.test.ts',
            'packages/pipeline/test/invariants/**/*.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/web/tests/integration/**/*.test.ts', 'packages/db/test/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          testTimeout: 20_000,
        },
      },
    ],
  },
});

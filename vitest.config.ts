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

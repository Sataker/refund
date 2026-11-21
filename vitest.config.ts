import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// *.live.test.ts only run with LIVE=1 (never in CI). TESTS §1.
const live = process.env.LIVE === '1';

// The two densest T11-19 sweeps take ~50 s each uncovered but blow past their per-test timeout under v8 coverage on
// the GitHub runner (60k: 225 s against 180 s in the first CI run). The CI coverage job sets SKIP_HEAVY_SWEEPS=1 and
// leaves them to the `golden` job, which runs every golden file without instrumentation; the code they exercise is
// still covered by profile.coverage.test.ts and profile.test.ts.
const skipHeavySweeps = process.env.SKIP_HEAVY_SWEEPS === '1';
const HEAVY_SWEEPS = [
  'packages/engine/test/golden/profile.coverage-60k.test.ts',
  'packages/engine/test/golden/profile.coverage-150k.test.ts',
];

// apps/web code imports `@/…` and `server-only` (E4): same alias as its tsconfig, and an empty
// stand-in for `server-only` (the real one throws outside Next's react-server condition).
const webResolve = {
  alias: {
    '@/': fileURLToPath(new URL('./apps/web/src/', import.meta.url)),
    'server-only': fileURLToPath(
      new URL('./apps/web/tests/integration/support/server-only.ts', import.meta.url),
    ),
  },
};

export default defineConfig({
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**', 'apps/web/src/**'],
      // TESTS §7.1.
      thresholds: {
        'packages/engine/src/**': { lines: 95, branches: 90 },
        'packages/pipeline/src/**': { lines: 85, branches: 80 },
        'apps/web/src/server/**': { lines: 70, branches: 60 },
        'packages/sources/src/**/whitelist.ts': { lines: 90, branches: 85 },
        'packages/sources/src/pii/**': { lines: 90, branches: 85 },
        'packages/sources/src/cnpj/validate.ts': { lines: 90, branches: 85 },
        'packages/ai/src/guards/**': { lines: 95, branches: 90 },
      },
    },
    projects: [
      {
        resolve: webResolve,
        test: {
          name: 'unit',
          include: [
            'packages/*/test/**/*.test.ts',
            'apps/web/src/**/*.test.ts',
            // Vitest tests of the scripts (the other scripts/test files run under `node --test` in CI).
            'scripts/test/**/*.unit.test.ts',
          ],
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
          exclude: ['**/node_modules/**', ...(skipHeavySweeps ? HEAVY_SWEEPS : [])],
          environment: 'node',
        },
      },
      {
        resolve: webResolve,
        test: {
          name: 'integration',
          include: ['apps/web/tests/integration/**/*.test.ts', 'packages/db/test/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          testTimeout: 20_000,
          // PGlite migrations in beforeAll take seconds each; under parallel load the 10 s default timed out.
          hookTimeout: 60_000,
          maxWorkers: 4,
          // Vitest 5 refuses projects with different maxWorkers in the same group: run this one after the unit tests.
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});

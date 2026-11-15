/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
    {
      // An import pnpm cannot resolve (e.g. a package not declared in dependencies) hides a boundary breach.
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'pure-engine',
      severity: 'error',
      from: { path: '^packages/engine/src' },
      to: { pathNot: ['^packages/engine/src', 'node_modules/decimal\\.js'] },
    },
    {
      name: 'pure-law',
      severity: 'error',
      from: { path: '^packages/law/src' },
      to: { pathNot: '^packages/law/' },
    },
    {
      name: 'sources-without-domain',
      severity: 'error',
      from: { path: '^packages/sources/src' },
      to: { path: '^packages/(engine|pipeline|ai|db)/' },
    },
    {
      name: 'pipeline-without-io',
      severity: 'error',
      from: { path: '^packages/pipeline/src' },
      to: {
        path: ['^packages/(db|ai)/', 'node_modules/(ai|next|react|postgres|drizzle-orm)/'],
      },
    },
    {
      name: 'nobody-imports-web',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'client-without-server',
      severity: 'error',
      from: { path: '^apps/web/src/(components|features)/.*\\.client\\.tsx?$' },
      to: { path: ['^apps/web/src/server/', '^packages/(db|ai|sources|pipeline)/'] },
    },
    {
      name: 'no-deep-import',
      severity: 'error',
      from: { pathNot: '/test/' },
      to: { path: '^packages/[^/]+/src/', dependencyTypes: ['npm'] },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.depcruise.json' }, // base + apps/web's @/ alias
    // Without this, @refund/* imports stay unresolved and the cross-package rules never fire.
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: {
      path: ['\\.next/', 'node_modules/', '\\.d\\.ts$', 'playwright-report/', 'test-results/'],
    },
  },
};

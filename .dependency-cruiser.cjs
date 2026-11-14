/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    { name: 'no-cycles', severity: 'error', from: {}, to: { circular: true } },
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
    tsConfig: { fileName: 'tsconfig.base.json' },
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: ['\\.next/', 'node_modules/'] },
  },
};

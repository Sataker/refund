// Project conventions that Biome and dependency-cruiser do not cover (ARCHITECTURE §3.3, TESTS §5).
// Usage: node scripts/lint-conventions.ts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface Violation {
  file: string;
  rule: string;
}

const EDGE_RUNTIME = /export\s+const\s+runtime\b[^=]*=\s*['"]edge['"]/;
const USE_CLIENT = /^\s*['"]use client['"]/m;
const ENGINE_FORBIDDEN: Array<[RegExp, string]> = [
  [/\bDate\b/, 'engine-uses-Date'],
  [/\bMath\.random\b/, 'engine-uses-Math.random'],
  [/\bfetch\s*\(/, 'engine-uses-fetch'],
  [/\bprocess\./, 'engine-uses-process'],
  [/\bconsole\./, 'engine-uses-console'],
];

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function checkFile(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const code = stripComments(source);
  if (EDGE_RUNTIME.test(code)) violations.push({ file, rule: 'edge-runtime' });
  if (code.includes('dangerouslySetInnerHTML'))
    violations.push({ file, rule: 'dangerously-set-inner-html' });
  if (USE_CLIENT.test(code) && !/\.client\.tsx?$/.test(file)) {
    violations.push({ file, rule: "'use client'-without-.client.tsx" });
  }
  if (file.startsWith('packages/engine/src/')) {
    for (const [pattern, rule] of ENGINE_FORBIDDEN) {
      if (pattern.test(code)) violations.push({ file, rule });
    }
  }
  return violations;
}

function sourceFiles(): string[] {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', 'apps', 'packages'],
    {
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f));
}

function main(): void {
  const violations = sourceFiles().flatMap((f) => checkFile(f, readFileSync(f, 'utf8')));
  if (violations.length === 0) {
    console.log('lint-conventions: ok');
    return;
  }
  for (const v of violations) console.error(`${v.file}  [${v.rule}]`);
  process.exit(1);
}

if (import.meta.main) main();

// Freeze checklist, automatable items (INFRA-CI §8.4). E0 implements the static items 1–5 and 10.
// Items 6–9 (guard, recordings, production/backup health) are added at G3/E22.
// Usage: node scripts/freeze-check.ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { checkFile } from './lint-conventions.ts';

const EXPECTED_EMAIL = 'enzosvacarro@gmail.com';

// Decision D8 (PLAN §0): only code goes to GitHub; docs/ and CLAUDE.md stay on Enzo's disk.
const PRIVATE_PATHS: RegExp[] = [
  /^docs\//,
  /^CLAUDE\.md$/,
  /^docs-privado\//,
  /(^|\/)REVISAO-PLANO\.md$/,
];

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function trackedFiles(): string[] {
  return git('ls-files', '-z').split('\0').filter(Boolean);
}

type Check = { id: number; name: string; run: () => string[] };

const checks: Check[] = [
  {
    id: 1,
    name: 'no Dependabot or Renovate config',
    run: () =>
      [
        '.github/dependabot.yml',
        '.github/dependabot.yaml',
        'renovate.json',
        '.github/renovate.json',
      ].filter((f) => existsSync(f)),
  },
  {
    id: 2,
    name: 'workflows are read-only',
    run: () =>
      trackedFiles()
        .filter((f) => f.startsWith('.github/workflows/'))
        .flatMap((f) => {
          const text = readFileSync(f, 'utf8');
          return ['contents: write', 'pull-requests: write', 'git push', 'git commit']
            .filter((needle) => text.includes(needle))
            .map((needle) => `${f}: "${needle}"`);
        }),
  },
  {
    id: 3,
    name: `author e-mail is ${EXPECTED_EMAIL}`,
    run: () => {
      const problems: string[] = [];
      let configured = '';
      try {
        configured = git('config', 'user.email');
      } catch {}
      if (configured !== EXPECTED_EMAIL) problems.push(`git config user.email = "${configured}"`);
      let authors: string[] = [];
      try {
        authors = git('log', '--format=%ae').split('\n').filter(Boolean);
      } catch {} // no commits yet
      for (const a of new Set(authors))
        if (a !== EXPECTED_EMAIL) problems.push(`commit author ${a}`);
      return problems;
    },
  },
  {
    id: 4,
    name: '.gitignore contains docs-privado/',
    run: () => (readFileSync('.gitignore', 'utf8').includes('docs-privado/') ? [] : ['.gitignore']),
  },
  {
    id: 5,
    name: 'no private doc is versioned',
    run: () => trackedFiles().filter((f) => PRIVATE_PATHS.some((p) => p.test(f))),
  },
  {
    id: 10,
    name: "no file exports runtime = 'edge'",
    run: () =>
      trackedFiles()
        .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
        .flatMap((f) => checkFile(f, readFileSync(f, 'utf8')))
        .filter((v) => v.rule === 'edge-runtime')
        .map((v) => v.file),
  },
];

function main(): void {
  let failed = false;
  for (const check of checks) {
    const problems = check.run();
    console.log(`${problems.length === 0 ? 'ok  ' : 'FAIL'}  ${check.id}. ${check.name}`);
    for (const p of problems) console.log(`        ${p}`);
    if (problems.length > 0) failed = true;
  }
  console.log(
    'skip  6–9 (pnpm guard in CI, recordings, production and backup health: added at G3/E22)',
  );
  if (failed) process.exit(1);
}

if (import.meta.main) main();

// Freeze checklist, automatable items (INFRA-CI §8.4). E0 implements the static items 1–5 and 10; E14 item 11; E20
// items 12–14; D37 item 15. Items 6–9 (guard, recordings, production/backup health) are added at G3/E22.
// Usage: node scripts/freeze-check.ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { inputsHashProblems, STATS_FILE } from './generate-engine-page.ts';
import { checkFile } from './lint-conventions.ts';

const EXPECTED_EMAIL = 'enzosvacarro@gmail.com';
const WRITE_ACCESS = /\b[a-z-]+\s*:\s*write\b|write-all|git\s+(push|commit)\b/g;

// Decision D8 (PLAN §0): only code goes to GitHub; docs/ and CLAUDE.md stay on Enzo's disk.
const PRIVATE_PATHS: RegExp[] = [
  /^docs\//,
  /(^|\/)CLAUDE\.md$/,
  /(^|\/)docs-privado\//,
  /(^|\/)REVISAO-PLANO\.md$/,
  // Receita simulator code has no license (only its public JSON tables may be versioned).
  /(^|\/)simulador-receita\/(main\.js|index\.html)$/,
];

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function trackedFiles(): string[] {
  return git('ls-files', '-z').split('\0').filter(Boolean);
}

type Check = { id: number; name: string; run: () => string[] };

export const CONTACT_FILE = 'apps/web/src/lib/contact.ts';

/**
 * /privacidade and the waitlist promise a contact address (compliance review E14, M1). It lives in one constant;
 * while it is the placeholder (or anything that is not an e-mail), the freeze cannot pass.
 */
export function contactProblems(source: string): string[] {
  const line = source.split('\n').find((l) => /export const CONTACT_EMAIL\b/.test(l));
  if (line === undefined) return [`${CONTACT_FILE}: CONTACT_EMAIL not found`];
  const value = /=\s*'([^']*)'/.exec(line)?.[1];
  if (value === undefined || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    return [`${CONTACT_FILE}: CONTACT_EMAIL is not an e-mail yet (placeholder CONTATO_PENDENTE)`];
  return [];
}

/**
 * Item 15 (D37): /termos identifies the seller by name, city and contact e-mail. The city lives in one constant; while
 * it is the placeholder (or not a plain place name), the freeze cannot pass.
 */
export function cityProblems(source: string): string[] {
  const line = source.split('\n').find((l) => /export const CONTACT_CITY\b/.test(l));
  if (line === undefined) return [`${CONTACT_FILE}: CONTACT_CITY not found`];
  const value = /=\s*'([^']*)'/.exec(line)?.[1]?.trim();
  if (value === undefined || value === 'CIDADE_PENDENTE' || !/^\p{L}[\p{L} '’.,/-]*$/u.test(value))
    return [`${CONTACT_FILE}: CONTACT_CITY is not a city yet (placeholder CIDADE_PENDENTE)`];
  return [];
}

export const STATUS_FILE = 'apps/web/src/lib/status.ts';

/**
 * /status links the UptimeRobot status page (ARCHITECTURE §10.3). It lives in one constant; while it is the
 * placeholder (or anything that is not an https URL on uptimerobot.com), the freeze cannot pass.
 */
export function statusPageProblems(source: string): string[] {
  const line = source.split('\n').find((l) => /export const STATUS_PAGE_URL\b/.test(l));
  if (line === undefined) return [`${STATUS_FILE}: STATUS_PAGE_URL not found`];
  const value = /=\s*'([^']*)'/.exec(line)?.[1];
  let url: URL | null = null;
  try {
    url = value === undefined ? null : new URL(value);
  } catch {}
  const host = url?.hostname ?? '';
  if (
    url?.protocol !== 'https:' ||
    !(host === 'uptimerobot.com' || host.endsWith('.uptimerobot.com'))
  )
    return [
      `${STATUS_FILE}: STATUS_PAGE_URL is not an UptimeRobot URL yet (placeholder STATUS_PENDENTE)`,
    ];
  return [];
}

/** README placeholders that must be gone before the freeze (the GIF, the video and demo links). */
const README_PLACEHOLDERS: RegExp[] = [/TODO\(E2/, /em breve/i, /coming soon/i];

/** Item 14: README*.md still carries a placeholder (a `TODO(E2x)` marker, "em breve" or "coming soon"). */
export function readmeProblems(file: string, source: string): string[] {
  return source
    .split('\n')
    .flatMap((line, i) =>
      README_PLACEHOLDERS.some((re) => re.test(line)) ? [`${file}:${i + 1}: ${line.trim()}`] : [],
    );
}

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
          return [...text.matchAll(WRITE_ACCESS)].map((m) => `${f}: "${m[0]}"`);
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
  {
    id: 11,
    name: 'contact e-mail set (/privacidade, waitlist)',
    run: () => contactProblems(readFileSync(CONTACT_FILE, 'utf8')),
  },
  {
    id: 12,
    name: 'UptimeRobot status page set (/status)',
    run: () => statusPageProblems(readFileSync(STATUS_FILE, 'utf8')),
  },
  {
    id: 13,
    name: '/motor numbers generated from the current golden inputs',
    run: () => inputsHashProblems(readFileSync(STATS_FILE, 'utf8')),
  },
  {
    id: 14,
    name: 'no placeholder left in the READMEs',
    run: () =>
      trackedFiles()
        .filter((f) => /^README[^/]*\.md$/.test(f))
        .flatMap((f) => readmeProblems(f, readFileSync(f, 'utf8'))),
  },
  {
    id: 15,
    name: 'seller city set (/termos identification)',
    run: () => cityProblems(readFileSync(CONTACT_FILE, 'utf8')),
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

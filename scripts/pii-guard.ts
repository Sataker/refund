// PII guard (ARCHITECTURE §6.4). E0 version: forbidden JSON keys (QSA) and formatted CPF.
// E7 completes it (unformatted CPF with check digit, e-mail, phone, forbidden-key list, persona CNPJs).
// Usage: node scripts/pii-guard.ts [--ci | --staged]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export interface Finding {
  file: string;
  line: number;
  rule: 'forbidden-key' | 'formatted-cpf' | 'exception-without-reason';
  excerpt: string;
}

export interface Exception {
  value: string;
  file: string;
  reason: string;
  source: string;
}

const FORBIDDEN_KEYS = ['qsa', 'cnpj_cpf_do_socio'];
const FORMATTED_CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const BINARY_EXTENSIONS = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.zip',
]);

export function mask(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function isExcepted(file: string, value: string, exceptions: Exception[]): boolean {
  return exceptions.some((e) => e.value === value && (e.file === '*' || e.file === file));
}

export function scanText(file: string, text: string, exceptions: Exception[] = []): Finding[] {
  const findings: Finding[] = [];

  if (extname(file) === '.json') {
    for (const key of FORBIDDEN_KEYS) {
      const pattern = new RegExp(`"${key}"\\s*:`, 'gi');
      for (const match of text.matchAll(pattern)) {
        findings.push({
          file,
          line: lineOf(text, match.index),
          rule: 'forbidden-key',
          excerpt: `"${key}": …`,
        });
      }
    }
  }

  for (const match of text.matchAll(FORMATTED_CPF)) {
    if (isExcepted(file, match[0], exceptions)) continue;
    findings.push({
      file,
      line: lineOf(text, match.index),
      rule: 'formatted-cpf',
      excerpt: mask(match[0]),
    });
  }

  return findings;
}

export function validateExceptions(exceptions: Exception[]): Finding[] {
  return exceptions
    .filter((e) => typeof e.reason !== 'string' || e.reason.trim() === '')
    .map((e) => ({
      file: 'scripts/pii-exceptions.json',
      line: 0,
      rule: 'exception-without-reason' as const,
      excerpt: mask(String(e.value)),
    }));
}

function gitFiles(staged: boolean): string[] {
  const args = staged
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
  return execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);
}

function readStaged(file: string): string {
  return execFileSync('git', ['show', `:${file}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

function main(): void {
  const staged = process.argv.includes('--staged');
  const exceptions = JSON.parse(readFileSync('scripts/pii-exceptions.json', 'utf8')) as Exception[];
  const findings: Finding[] = validateExceptions(exceptions);

  for (const file of gitFiles(staged)) {
    if (BINARY_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    if (file === 'scripts/pii-exceptions.json') continue;
    if (file.startsWith('scripts/test/')) continue; // poisoned fixtures of the guard's own tests
    let text: string;
    try {
      text = staged ? readStaged(file) : readFileSync(file, 'utf8');
    } catch {
      continue; // deleted or unreadable
    }
    findings.push(...scanText(file, text, exceptions));
  }

  if (findings.length === 0) {
    console.log('pii-guard: ok');
    return;
  }
  for (const f of findings) console.error(`${f.file}:${f.line}  [${f.rule}]  ${f.excerpt}`);
  console.error(`pii-guard: ${findings.length} finding(s)`);
  process.exit(1);
}

if (import.meta.main) main();

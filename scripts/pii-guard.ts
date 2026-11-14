// PII guard (ARCHITECTURE §6.4, TESTS §5). Node 24, no dependencies: the detectors are the same ones
// the recorder uses (`packages/sources/src/pii/detect.ts`, dependency-free, loaded by type stripping).
// Rules: 1 forbidden JSON keys at any depth · 2 formatted CPF · 3 unformatted CPF (valid check digit,
// near cpf/doc/tax/document/socio) · 4 e-mail outside the allowed domains · 5 BR phone near
// tel/phone/fone/celular · 6 CNPJ in packages/personas/data/ not listed in personas/src/cnpjs.ts.
// Output: path, line, rule and a masked excerpt; never the whole value found.
// Usage: node scripts/pii-guard.ts [--ci | --staged]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { cnpjCheckDigits } from '../packages/sources/src/cnpj/validate.ts';
import { mask } from '../packages/sources/src/pii/cpf.ts';
import {
  detectPii,
  findForbiddenKeys,
  scanText as scanPii,
} from '../packages/sources/src/pii/detect.ts';
import type { PiiRule } from '../packages/sources/src/types.ts';

export { mask };

export interface Finding {
  file: string;
  line: number;
  rule: PiiRule | 'exception-without-reason' | 'cpf-in-exceptions';
  excerpt: string;
}

export interface Exception {
  value: string;
  file: string;
  reason: string;
  source: string;
}

export interface GuardContext {
  exceptions: readonly Exception[];
  /** Canonical CNPJs listed in packages/personas/src/cnpjs.ts. */
  personaCnpjs: ReadonlySet<string>;
}

const EXCEPTIONS_FILE = 'scripts/pii-exceptions.json';
const PERSONA_CNPJS_FILE = 'packages/personas/src/cnpjs.ts';
const PERSONA_DATA = 'packages/personas/data/';
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

const EMPTY_CONTEXT: GuardContext = { exceptions: [], personaCnpjs: new Set() };

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function fileMatches(pattern: string, file: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2));
  return pattern === file;
}

/** An exception covers the exact value, or every e-mail of a domain listed as the value. */
export function isExcepted(exceptions: readonly Exception[], file: string, raw: string): boolean {
  const value = raw.toLowerCase();
  return exceptions.some((e) => {
    if (typeof e.reason !== 'string' || e.reason.trim() === '') return false;
    if (!fileMatches(e.file, file)) return false;
    const allowed = String(e.value).toLowerCase();
    return value === allowed || value.endsWith(`@${allowed}`) || value.endsWith(`.${allowed}`);
  });
}

/** CNPJs quoted in personas/src/cnpjs.ts (read as text: the guard imports no workspace package). */
export function personaCnpjsFrom(source: string): Set<string> {
  return new Set([...source.matchAll(/['"]([0-9A-Z]{12}\d{2})['"]/g)].map((m) => m[1] ?? ''));
}

const BARE_CNPJ = /(?<![0-9A-Za-z])[0-9A-Z]{12}\d{2}(?![0-9A-Za-z])/g;
const MASKED_CNPJ =
  /(?<![0-9A-Za-z])[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}(?!\d)/g;

function isCnpj(canonical: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(canonical) || /^(.)\1{13}$/.test(canonical)) return false;
  return canonical.slice(12) === cnpjCheckDigits(canonical.slice(0, 12));
}

function personaCnpjFindings(file: string, text: string, ctx: GuardContext): Finding[] {
  const findings: Finding[] = [];
  for (const pattern of [BARE_CNPJ, MASKED_CNPJ]) {
    for (const m of text.matchAll(pattern)) {
      const canonical = m[0].replace(/[./-]/g, '');
      if (!isCnpj(canonical) || ctx.personaCnpjs.has(canonical)) continue;
      if (isExcepted(ctx.exceptions, file, m[0])) continue;
      findings.push({
        file,
        line: lineOf(text, m.index),
        rule: 'persona-cnpj',
        excerpt: mask(m[0]),
      });
    }
  }
  return findings;
}

export function scanText(file: string, text: string, ctx: GuardContext = EMPTY_CONTEXT): Finding[] {
  const findings: Finding[] = [];
  const at = (index: number | undefined): number => lineOf(text, index ?? 0);

  if (extname(file) === '.json') {
    for (const f of findForbiddenKeys(text)) {
      findings.push({ file, line: at(f.index), rule: f.rule, excerpt: f.excerpt });
    }
  }
  const allow = (_rule: string, raw: string): boolean => isExcepted(ctx.exceptions, file, raw);
  for (const f of scanPii(text, { allow })) {
    findings.push({ file, line: at(f.index), rule: f.rule, excerpt: f.excerpt });
  }
  if (extname(file) === '.json') findings.push(...jsonFindings(file, text, findings, allow));
  if (file.startsWith(PERSONA_DATA)) findings.push(...personaCnpjFindings(file, text, ctx));
  return findings;
}

/** Value at a `detectPii` path such as `$.a.b[0].c`. */
function valueAt(root: unknown, path: string): unknown {
  let v: unknown = root;
  for (const m of path.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[m[1] ?? m[2] ?? ''];
  }
  return v;
}

/**
 * Second pass over parsed JSON: `detectPii` sees the whole path as context, so a CPF in
 * `documentNumber.value` is found even when the key is more than 30 characters away in the text.
 * Findings the text scan already reported are not repeated.
 */
function jsonFindings(
  file: string,
  text: string,
  already: readonly Finding[],
  allow: (rule: string, raw: string) => boolean,
): Finding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const seen = new Set(already.map((f) => `${f.rule}|${f.excerpt}`));
  const out: Finding[] = [];
  for (const f of detectPii(parsed, '$', { allow })) {
    if (f.rule === 'forbidden-key' || seen.has(`${f.rule}|${f.excerpt}`)) continue;
    seen.add(`${f.rule}|${f.excerpt}`);
    const leaf = valueAt(parsed, f.path);
    const index = leaf === undefined ? -1 : text.indexOf(String(leaf));
    out.push({ file, line: index < 0 ? 0 : lineOf(text, index), rule: f.rule, excerpt: f.excerpt });
  }
  return out;
}

const CPF_LIKE = /^\D*\d{3}\D?\d{3}\D?\d{3}\D?\d{2}\D*$/;

export function validateExceptions(exceptions: Exception[]): Finding[] {
  const findings: Finding[] = [];
  for (const e of exceptions) {
    const value = String(e.value);
    if (typeof e.reason !== 'string' || e.reason.trim() === '') {
      findings.push({
        file: EXCEPTIONS_FILE,
        line: 0,
        rule: 'exception-without-reason',
        excerpt: mask(value),
      });
    }
    // No exception for CPFs (ARCHITECTURE §6.4: "the CPF guard has no exception").
    if (CPF_LIKE.test(value)) {
      findings.push({
        file: EXCEPTIONS_FILE,
        line: 0,
        rule: 'cpf-in-exceptions',
        excerpt: mask(value),
      });
    }
  }
  return findings;
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
  const exceptions = JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8')) as Exception[];
  const ctx: GuardContext = {
    exceptions,
    personaCnpjs: existsSync(PERSONA_CNPJS_FILE)
      ? personaCnpjsFrom(readFileSync(PERSONA_CNPJS_FILE, 'utf8'))
      : new Set(),
  };
  const findings: Finding[] = validateExceptions(exceptions);

  for (const file of gitFiles(staged)) {
    if (BINARY_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    let text: string;
    try {
      text = staged ? readStaged(file) : readFileSync(file, 'utf8');
    } catch {
      continue; // deleted or unreadable
    }
    findings.push(...scanText(file, text, ctx));
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

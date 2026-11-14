import type { PiiFinding, PiiRule } from '../types.ts';
import { isValidCpf, mask } from './cpf.ts';

// Personal-data detectors shared by the recorder (fails the recording) and by scripts/pii-guard.ts
// (fails the commit and the PR), ARCHITECTURE §5.2 and §6.4. Dependency-free on purpose: the guard
// imports this file directly with Node 24's type stripping.

/** Rule 1: keys that never appear in a fixture, recording, persona or log, at any depth. */
export const FORBIDDEN_KEYS: readonly string[] = [
  'qsa',
  'cnpj_cpf_do_socio',
  'nome_socio',
  'representante_legal',
  'ddd_telefone_1',
  'ddd_telefone_2',
  'logradouro',
  'cep',
  'email',
  'fullName',
  'birthDate',
  'taxNumber',
  'descriptionRaw',
  'accountNumber',
  'branchNumber',
];

/** Rule 4: e-mail domains that are not personal (RFC 2606 style + the product's domain, PLAN D6). */
export const ALLOWED_EMAIL_DOMAINS: readonly string[] = [
  'exemplo.com.br',
  'example.com',
  'refund.invalid',
  'userefund.com.br',
];

const NEIGHBORHOOD = 30;
const CPF_CONTEXT = /cpf|doc|tax|document|socio/i;
const PHONE_CONTEXT = /tel|phone|fone|celular/i;
// Digit-based look-around only: a CPF glued to letters ("REF529.…") must still be found.
const FORMATTED_CPF = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
/** Partial or spaced CPF (`NNNNNNNNN-NN`, `NNN NNN NNN NN`), reported when the check digits are valid. */
const LOOSE_CPF = /(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?!\d)/g;
const ELEVEN_DIGITS = /(?<!\d)\d{11}(?!\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
const PHONE = /(?<!\d)\(?\d{2}\)?\s?9?\d{4}-?\d{4}(?!\d)/g;

export interface ScanOptions {
  /** Extra context (e.g. the JSON key that holds the text) checked by the neighborhood rules. */
  context?: string;
  /** Path reported in the findings (default `$`). */
  path?: string;
  /** Exception hook (the guard's `pii-exceptions.json`). Never consulted for CPFs. */
  allow?: (rule: Exclude<PiiRule, 'formatted-cpf' | 'unformatted-cpf'>, raw: string) => boolean;
}

function near(text: string, index: number, length: number, pattern: RegExp, context = ''): boolean {
  const before = text.slice(Math.max(0, index - NEIGHBORHOOD), index);
  const after = text.slice(index + length, index + length + NEIGHBORHOOD);
  return pattern.test(context) || pattern.test(before) || pattern.test(after);
}

export function isAllowedEmailDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((allowed) => d === allowed || d.endsWith(`.${allowed}`));
}

/** Rules 2–5 over free text. Findings carry a masked excerpt and the offset of the match. */
export function scanText(text: string, options: ScanOptions = {}): PiiFinding[] {
  const path = options.path ?? '$';
  const context = options.context ?? '';
  const findings: PiiFinding[] = [];
  const push = (rule: PiiRule, raw: string, index: number): void => {
    findings.push({ path, rule, excerpt: mask(raw), index });
  };

  // CPFs have no exception (ARCHITECTURE §6.4).
  for (const m of text.matchAll(FORMATTED_CPF)) push('formatted-cpf', m[0], m.index);
  for (const m of text.matchAll(LOOSE_CPF)) {
    // Fully formatted ones were reported above; bare 11 digits need context (rule 3, below).
    if (/^\d{11}$/.test(m[0]) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(m[0])) continue;
    if (isValidCpf(m[0].replace(/\D/g, ''))) push('formatted-cpf', m[0], m.index);
  }
  for (const m of text.matchAll(ELEVEN_DIGITS)) {
    if (isValidCpf(m[0]) && near(text, m.index, m[0].length, CPF_CONTEXT, context)) {
      push('unformatted-cpf', m[0], m.index);
    }
  }
  for (const m of text.matchAll(EMAIL)) {
    const domain = m[1] ?? '';
    if (isAllowedEmailDomain(domain)) continue;
    if (options.allow?.('email', m[0])) continue;
    push('email', m[0], m.index);
  }
  for (const m of text.matchAll(PHONE)) {
    if (!near(text, m.index, m[0].length, PHONE_CONTEXT, context)) continue;
    if (options.allow?.('phone', m[0])) continue;
    push('phone', m[0], m.index);
  }
  return findings;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FORBIDDEN_KEY_IN_JSON = new RegExp(
  `"(${FORBIDDEN_KEYS.map(escapeRegExp).join('|')})"\\s*:`,
  'gi',
);

/** Rule 1 over JSON text (any depth), with offsets so the guard can report the line. */
export function findForbiddenKeys(jsonText: string): PiiFinding[] {
  return [...jsonText.matchAll(FORBIDDEN_KEY_IN_JSON)].map((m) => ({
    path: '$',
    rule: 'forbidden-key' as const,
    excerpt: `"${m[1]}": …`,
    index: m.index,
  }));
}

const FORBIDDEN = new Set(FORBIDDEN_KEYS.map((k) => k.toLowerCase()));

/**
 * Rules 1–5 over a value (the recorder's and the guard's check). The full JSON path of a string or
 * number is its context for the CPF and phone neighborhood rules. `email` is tolerated only inside
 * `sanitization` (where it names a discarded field, never a value).
 */
export function detectPii(
  value: unknown,
  path = '$',
  options: Pick<ScanOptions, 'allow'> = {},
): PiiFinding[] {
  const findings: PiiFinding[] = [];
  const walk = (v: unknown, p: string, inSanitization: boolean): void => {
    if (typeof v === 'string' || typeof v === 'number') {
      // The whole path is the context: `documentNumber.value` must count as a document field.
      for (const f of scanText(String(v), { ...options, path: p, context: p })) {
        const { index: _ignored, ...rest } = f;
        findings.push(rest);
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        walk(item, `${p}[${i}]`, inSanitization);
      });
      return;
    }
    if (v !== null && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        const lower = k.toLowerCase();
        if (FORBIDDEN.has(lower) && !(lower === 'email' && inSanitization)) {
          findings.push({ path: `${p}.${k}`, rule: 'forbidden-key', excerpt: `"${k}": …` });
        }
        walk(child, `${p}.${k}`, inSanitization || k === 'sanitization');
      }
    }
  };
  walk(value, path, false);
  return findings;
}

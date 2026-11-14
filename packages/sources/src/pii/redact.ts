import { cnpjCheckDigits } from '../cnpj/validate.ts';
import type { ProtectedDocument } from '../types.ts';
import { isValidCpf } from './cpf.ts';

// Redaction of free text that leaves the provider (ARCHITECTURE §6.3).

const DOC = '[doc]';
const FORMATTED_CPF = /(?<![0-9A-Za-z])\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
const FORMATTED_CNPJ =
  /(?<![0-9A-Za-z])[0-9A-Za-z]{2}\.[0-9A-Za-z]{3}\.[0-9A-Za-z]{3}\/[0-9A-Za-z]{4}-\d{2}(?!\d)/g;
const DIGIT_RUN = /(?<!\d)\d{11}(?!\d)|(?<!\d)\d{14}(?!\d)/g;
const LONG_DIGITS = /\d{6,}/g;

function isValidNumericCnpj(digits: string): boolean {
  if (/^(\d)\1{13}$/.test(digits)) return false;
  return digits.slice(12) === cnpjCheckDigits(digits.slice(0, 12));
}

/**
 * Replaces documents with `[doc]`: any formatted CPF or CNPJ (alphanumeric CNPJ included), and runs of
 * exactly 11 or 14 digits with a valid CPF/CNPJ check digit.
 */
export function stripDocuments(text: string): string {
  return text
    .replace(FORMATTED_CPF, DOC)
    .replace(FORMATTED_CNPJ, DOC)
    .replace(DIGIT_RUN, (run) =>
      (run.length === 11 ? isValidCpf(run) : isValidNumericCnpj(run)) ? DOC : run,
    );
}

/** Folds one code point (accents off, lower case); keeps it unchanged if folding is not 1:1. */
function foldChar(ch: string): string {
  const folded = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return Array.from(folded).length === 1 ? folded : ch;
}

/** Replaces every whole-word occurrence of `name` (case- and accent-insensitive, any run of spaces). */
function replaceName(text: string, name: string): string {
  const words = Array.from(name.trim()).map(foldChar).join('').split(/\s+/).filter(Boolean);
  if (words.length === 0) return text;
  const chars = Array.from(text);
  const folded = chars.map(foldChar);
  // UTF-16 offset in the folded text → code-point index (each folded element is one code point).
  const indexAt = new Map<number, number>();
  let offset = 0;
  folded.forEach((c, i) => {
    indexAt.set(offset, i);
    offset += c.length;
  });
  indexAt.set(offset, chars.length);
  const body = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'gu');
  let out = '';
  let last = 0;
  for (const m of folded.join('').matchAll(pattern)) {
    const start = indexAt.get(m.index) ?? last;
    const end = indexAt.get(m.index + m[0].length) ?? start;
    out += `${chars.slice(last, start).join('')}[pessoa]`;
    last = end;
  }
  return out + chars.slice(last).join('');
}

/**
 * Transaction description that may leave the provider: (1) `stripDocuments`; (2) when the counterparty
 * is a CPF and has a name, its occurrences become `[pessoa]`; (3) runs of 6 or more digits become `#`.
 */
export function redactDescription(
  text: string,
  counterparty?: { document: ProtectedDocument | null; name: string | null },
): string {
  let out = stripDocuments(text);
  if (counterparty?.document?.type === 'CPF' && counterparty.name) {
    out = replaceName(out, counterparty.name);
  }
  return out.replace(LONG_DIGITS, '#');
}

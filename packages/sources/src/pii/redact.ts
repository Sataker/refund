import { cnpjCheckDigits } from '../cnpj/validate.ts';
import type { ProtectedDocument } from '../types.ts';
import { isValidCpf } from './cpf.ts';

// Redaction of free text that leaves the provider (ARCHITECTURE §6.3).

const DOC = '[doc]';
// Look-around is digit-based only: a document glued to letters ("PIX REF529.…") is still a document.
const FORMATTED_CPF = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
/** Bare, partial (`…-NN`) or spaced CPF; replaced only when the check digits are valid. */
const LOOSE_CPF = /(?<!\d)\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}(?!\d)/g;
// No look-behind: an alphanumeric CNPJ may start with letters, and over-redacting is the safe side.
const FORMATTED_CNPJ =
  /[0-9A-Za-z]{2}\.[0-9A-Za-z]{3}\.[0-9A-Za-z]{3}\/[0-9A-Za-z]{4}-\d{2}(?!\d)/g;
const CNPJ_RUN = /(?<!\d)\d{14}(?!\d)/g;
const LONG_DIGITS = /\d{6,}/g;

function isValidNumericCnpj(digits: string): boolean {
  if (/^(\d)\1{13}$/.test(digits)) return false;
  return digits.slice(12) === cnpjCheckDigits(digits.slice(0, 12));
}

/**
 * Replaces documents with `[doc]`: any formatted CPF or CNPJ (alphanumeric CNPJ included); bare,
 * partial or spaced CPFs (`\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}`) and 14-digit runs when their
 * check digits are valid.
 */
export function stripDocuments(text: string): string {
  return text
    .replace(FORMATTED_CNPJ, DOC)
    .replace(FORMATTED_CPF, DOC)
    .replace(LOOSE_CPF, (m) => (isValidCpf(m.replace(/\D/g, '')) ? DOC : m))
    .replace(CNPJ_RUN, (run) => (isValidNumericCnpj(run) ? DOC : run));
}

/** Folds one code point (accents off, lower case); keeps it unchanged if folding is not 1:1. */
function foldChar(ch: string): string {
  const folded = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return Array.from(folded).length === 1 ? folded : ch;
}

/** Replaces every whole-word occurrence of `name` (case- and accent-insensitive, any run of spaces). */
function replaceName(text: string, name: string): string {
  const words = Array.from(name.normalize('NFC').trim())
    .map(foldChar)
    .join('')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return text;
  // NFC first, so a decomposed "JOSÉ" folds like "JOSÉ" (one code point per letter).
  const chars = Array.from(text.normalize('NFC'));
  const foldedText = chars.map(foldChar).join('');
  const body = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'gu');
  // Each code point folds to exactly one code point, so code-point indexes match `chars`.
  const codePoints = (utf16End: number): number => Array.from(foldedText.slice(0, utf16End)).length;
  let out = '';
  let last = 0;
  for (const m of foldedText.matchAll(pattern)) {
    const start = codePoints(m.index);
    out += `${chars.slice(last, start).join('')}[pessoa]`;
    last = codePoints(m.index + m[0].length);
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

import { createHash, createHmac } from 'node:crypto';
import { cnpjCheckDigits, formatCnpj, validateCnpj } from '../cnpj/validate.ts';
import type { Cnpj, ProtectedDocument } from '../types.ts';
import { cpfCheckDigits, isValidCpf, maskCpf } from './cpf.ts';

/** Canonical form of a document before hashing: no mask, upper case. */
function canonical(doc: string): string {
  return doc.replace(/[.\-/\s]/g, '').toUpperCase();
}

/**
 * HMAC-SHA256(pepper, document) → base64url (43 chars), ARCHITECTURE §6.3. The document is canonicalised
 * first (masked and bare forms give the same HMAC), so "same holder" matches compare HMACs.
 */
export function hmacDocument(doc: string, pepper: Uint8Array): string {
  return createHmac('sha256', pepper).update(canonical(doc)).digest('base64url');
}

/** Masks of a partner document: nothing of the number shows (§6.2 "HMAC only"; `mask` is not nullable). */
export const HIDDEN_CPF_MASK = '***.***.***-**';
export const HIDDEN_CNPJ_MASK = '**.***.***/****-**';

/**
 * Builds a `ProtectedDocument` (ARCHITECTURE §4.3): a CPF keeps only HMAC (null without a pepper) and
 * mask, never the number; a CNPJ is public and stays in clear. A `partner` document (Identity
 * `parties[]`, §6.2) keeps only the HMAC: no public value and a fully hidden mask.
 * Returns null for a value that is neither a valid CPF nor a valid CNPJ.
 */
export function protectDocument(
  value: string,
  pepper: Uint8Array | null,
  options: { partner?: boolean } = {},
): ProtectedDocument | null {
  const doc = canonical(value);
  const partner = options.partner === true;
  if (isValidCpf(doc)) {
    return {
      type: 'CPF',
      hmac: pepper ? hmacDocument(doc, pepper) : null,
      publicValue: null,
      mask: partner ? HIDDEN_CPF_MASK : maskCpf(doc),
    };
  }
  const cnpj = validateCnpj(doc);
  if (cnpj.ok) {
    return {
      type: 'CNPJ',
      hmac: partner && pepper ? hmacDocument(doc, pepper) : null,
      publicValue: partner ? null : cnpj.value,
      mask: partner ? HIDDEN_CNPJ_MASK : formatCnpj(cnpj.value),
    };
  }
  return null;
}

/**
 * Deterministic synthetic document with a valid check digit derived from sha256(original), for Pluggy
 * sandbox fixtures (ARCHITECTURE §5.2). CNPJs get an `RFSB` root (same `RF` convention as the personas'
 * synthetic CNPJs, ARCHITECTURE §7.5), so a replaced document is recognisable in any fixture.
 */
export function syntheticDocument(original: string, type: 'CPF' | 'CNPJ'): string {
  const hash = createHash('sha256').update(canonical(original)).digest();
  if (type === 'CPF') {
    let base = '';
    for (let i = 0; base.length < 9; i++) base += String((hash[i] ?? 0) % 10);
    if (/^(\d)\1{8}$/.test(base)) base = `${base.slice(0, 8)}${(Number(base[8]) + 1) % 10}`;
    return `${base}${cpfCheckDigits(base)}`;
  }
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let middle = '';
  for (let i = 0; middle.length < 6; i++) middle += alphabet[(hash[i] ?? 0) % alphabet.length];
  const base = `RFSB${middle}01`;
  return `${base}${cnpjCheckDigits(base)}` as Cnpj;
}

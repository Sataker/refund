import type { Cnpj, ProviderError, Result } from '../types.ts';

// Alphanumeric CNPJ check digits, per the Receita/Serpro manual "Cálculo dos dígitos verificadores
// de CNPJ alfanumérico" (capture: docs/conferencias/fontes-oficiais/cnpj-alfanumerico-dv.md):
// each of the 12 base characters is worth (ASCII − 48), weights 2..9 from right to left (restarting
// after the 8th character), modulo 11; remainder 0 or 1 → digit 0, otherwise 11 − remainder.
// For digit-only CNPJs, ASCII − 48 is the digit itself, so old CNPJs validate unchanged.

const BASE = /^[0-9A-Z]{12}$/;
const FULL = /^[0-9A-Z]{12}[0-9]{2}$/;
const MASK_CHARS = /[.\-/\s]/g;

function checkDigit(chars: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = chars.length - 1; i >= 0; i--) {
    sum += (chars.charCodeAt(i) - 48) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** The two check digits for a 12-character base (`[0-9A-Z]{12}`), e.g. `'12ABC34501DE'` → `'35'`. */
export function cnpjCheckDigits(base: string): string {
  if (!BASE.test(base)) throw new RangeError('CNPJ base must be 12 characters [0-9A-Z]');
  const first = checkDigit(base);
  const second = checkDigit(`${base}${first}`);
  return `${first}${second}`;
}

// `source: 'input'` is outside the list documented in ARCHITECTURE §4.3 (no provider is involved
// in validating what the user typed); recorded in EXECUTION §9 (14/11).
function invalid(message: string): Result<Cnpj, ProviderError> {
  return { ok: false, error: { code: 'INVALID', message, recoverable: false, source: 'input' } };
}

/**
 * Accepts the masked (`12.ABC.345/01DE-35`) or bare form, in any case, and returns the canonical
 * 14-character uppercase CNPJ without a mask. Never throws (ARCHITECTURE §4.3).
 */
export function validateCnpj(input: string): Result<Cnpj, ProviderError> {
  const bare = input.replace(MASK_CHARS, '').toUpperCase();
  if (!FULL.test(bare)) {
    return invalid('CNPJ inválido: use 12 letras ou números seguidos de 2 dígitos.');
  }
  // All-equal sequences (e.g. 00000000000000) pass the modulo-11 check but are never issued.
  if (/^(.)\1{13}$/.test(bare)) return invalid('CNPJ inválido.');
  if (bare.slice(12) !== cnpjCheckDigits(bare.slice(0, 12))) {
    return invalid('CNPJ inválido: os dígitos verificadores não conferem.');
  }
  return { ok: true, value: bare as Cnpj };
}

/** Display mask `AA.AAA.AAA/AAAA-DD` for a valid CNPJ. */
export function formatCnpj(cnpj: Cnpj): string {
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

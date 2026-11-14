// CNPJ input on the landing (IDENTITY-AND-UI Screen 0: automatic mask, pasting with punctuation accepted,
// "Faltam N dígitos" in real time). Accepts the alphanumeric CNPJ (ARCHITECTURE §7.5): 12 alphanumeric
// characters + 2 numeric check digits. Display-only helper: the CNPJ provider validates again (E7/E11).

export const CNPJ_LENGTH = 14;

/** Keeps only what can be part of a CNPJ, uppercase, capped at 14 characters, in valid positions. */
export function normalizeCnpj(raw: string): string {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (out.length === CNPJ_LENGTH) break;
    const isDigit = ch >= '0' && ch <= '9';
    const isLetter = ch >= 'A' && ch <= 'Z';
    // Positions 13–14 are the numeric check digits.
    if (isDigit || (isLetter && out.length < 12)) out += ch;
  }
  return out;
}

/** "RFDEV001000158" → "RF.DEV.001/0001-58" (partial input is masked as far as it goes). */
export function maskCnpj(raw: string): string {
  const v = normalizeCnpj(raw);
  const parts: Array<[number, number, string]> = [
    [0, 2, ''],
    [2, 5, '.'],
    [5, 8, '.'],
    [8, 12, '/'],
    [12, 14, '-'],
  ];
  let out = '';
  for (const [start, end, sep] of parts) {
    const chunk = v.slice(start, end);
    if (chunk === '') break;
    out += sep + chunk;
  }
  return out;
}

const value = (ch: string): number => ch.charCodeAt(0) - 48;

function checkDigit(base: string): number {
  let weight = 2;
  let sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += value(base.charAt(i)) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export type CnpjStatus =
  | { kind: 'empty' }
  | { kind: 'incomplete'; missing: number }
  | { kind: 'invalid' }
  | { kind: 'valid'; cnpj: string };

export function cnpjStatus(raw: string): CnpjStatus {
  const v = normalizeCnpj(raw);
  if (v.length === 0) return { kind: 'empty' };
  if (v.length < CNPJ_LENGTH) return { kind: 'incomplete', missing: CNPJ_LENGTH - v.length };
  if (/^(.)\1{13}$/.test(v)) return { kind: 'invalid' };
  const dv1 = checkDigit(v.slice(0, 12));
  const dv2 = checkDigit(v.slice(0, 12) + String(dv1));
  return v.slice(12) === `${dv1}${dv2}` ? { kind: 'valid', cnpj: v } : { kind: 'invalid' };
}

/** Real-time hint below the field (pt-BR). */
export function cnpjHint(status: CnpjStatus): string | null {
  switch (status.kind) {
    case 'incomplete':
      return status.missing === 1 ? 'Falta 1 dígito' : `Faltam ${status.missing} dígitos`;
    case 'invalid':
      return 'Esse CNPJ não confere. Confere os números?';
    default:
      return null;
  }
}

import { type Cnpj, formatCnpj, type ProtectedDocument } from '@refund/sources';
import type { Prng } from './prng.ts';

// Documents as `ProtectedDocument` (ARCHITECTURE §4.3, §6.3). A CPF exists in clear only inside
// `syntheticCpfDocument` and is never returned, written or logged: the data keeps the mask, and
// `hmac` is null because personas have no PII_PEPPER (ARCHITECTURE §6.3).

function cpfCheckDigit(digits: number[]): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += (digits[i] ?? 0) * (digits.length + 1 - i);
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** A valid synthetic CPF drawn from the seeded PRNG, kept only as its mask. */
export function syntheticCpfDocument(prng: Prng): ProtectedDocument {
  let base: number[];
  do {
    base = Array.from({ length: 9 }, () => prng.int(0, 9));
  } while (base.every((d) => d === base[0]));
  const d1 = cpfCheckDigit(base);
  const full = [...base, d1, cpfCheckDigit([...base, d1])];
  const middle = full.slice(3, 9).join('');
  return {
    type: 'CPF',
    hmac: null,
    publicValue: null,
    mask: `***.${middle.slice(0, 3)}.${middle.slice(3)}-**`,
  };
}

/** Identity `parties[]` keep only the HMAC: a fully hidden mask (ARCHITECTURE §6.2; same as @refund/sources `protectDocument(…, partner)`). */
export function partnerDocument(doc: ProtectedDocument): ProtectedDocument {
  return {
    ...doc,
    publicValue: null,
    mask: doc.type === 'CPF' ? '***.***.***-**' : '**.***.***/****-**',
  };
}

export function cnpjDocument(cnpj: Cnpj): ProtectedDocument {
  return { type: 'CNPJ', hmac: null, publicValue: cnpj, mask: formatCnpj(cnpj) };
}

// CPF check digits (modulo 11, weights 10..2 and 11..2). Kept dependency-free: scripts/pii-guard.ts
// imports this file directly with Node's type stripping (ARCHITECTURE §6.4: "Node 24, no dependencies").

function checkDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** The two check digits for a 9-digit base. */
export function cpfCheckDigits(base: string): string {
  if (!/^\d{9}$/.test(base)) throw new RangeError('CPF base must be 9 digits');
  const first = checkDigit(base, 9);
  const second = checkDigit(`${base}${first}`, 10);
  return `${first}${second}`;
}

/** 11 digits (no mask) with valid check digits; all-equal sequences are never issued. */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  return digits.slice(9) === cpfCheckDigits(digits.slice(0, 9));
}

/** Masked CPF `***.456.789-**` from any input that holds 11 digits; `***.***.***-**` otherwise. */
export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/** Generic mask for findings and logs: keeps 2 characters on each side, never the whole value. */
export function mask(value: string): string {
  if (value.length <= 6) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
}

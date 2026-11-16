// Synthetic personal data built at runtime, so no document or e-mail is ever written in the repository
// (the PII guard scans test files too).

function checkDigit(digits: number[]): number {
  const weightStart = digits.length + 1;
  const sum = digits.reduce((acc, d, i) => acc + d * (weightStart - i), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** A CPF with valid check digits from a fixed synthetic base ("987.654.321-xx"), formatted or bare. */
export function syntheticCpf(formatted: boolean): string {
  const base = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  const d1 = checkDigit(base);
  const d2 = checkDigit([...base, d1]);
  const s = [...base, d1, d2].join('');
  return formatted ? `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
}

/** An e-mail on a domain outside the guard's allowed list. */
export const syntheticEmail = (user: string): string => [user, 'correio-pessoal.com'].join('@');

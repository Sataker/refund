import { describe, expect, it } from 'vitest';
import { cnpjCheckDigits } from '../src/cnpj/validate.ts';
import * as api from '../src/index.ts';
import { type Cnpj, formatCnpj, validateCnpj } from '../src/index.ts';

it('cnpjCheckDigits (throws) is not part of the public API', () => {
  expect('cnpjCheckDigits' in api).toBe(false);
});

// Vectors from the official manual (docs/conferencias/fontes-oficiais/cnpj-alfanumerico-dv.md).
describe('cnpjCheckDigits', () => {
  it('reproduces the official Serpro/Receita example 12.ABC.345/01DE-35', () => {
    expect(cnpjCheckDigits('12ABC34501DE')).toBe('35');
  });

  // Public control: the Receita's first alphanumeric CNPJ (news of 31/07/2026, research 03 §2.1),
  // the only real-world vector of the new format; it is a company's public registry number, not PII.
  it('matches the first alphanumeric CNPJ issued (00.000.000/E08G-12)', () => {
    expect(cnpjCheckDigits('00000000E08G')).toBe('12');
  });

  it('keeps the classic numeric algorithm for digit-only CNPJs', () => {
    // Made-up 90.731.548/9998-94 (BrasilAPI and CNPJ.ws: 404 on 14/11/2026). By hand:
    // Σ(9·5 + 0·4 + 7·3 + 3·2 + 1·9 + 5·8 + 4·7 + 8·6 + 9·5 + 9·4 + 9·3 + 8·2) = 321, 321 mod 11 = 2 → 9;
    // with the 9 appended, Σ = 403, 403 mod 11 = 7 → 4.
    expect(cnpjCheckDigits('907315489998')).toBe('94');
  });

  it('rejects a malformed base', () => {
    expect(() => cnpjCheckDigits('12abc34501de')).toThrow(RangeError);
    expect(() => cnpjCheckDigits('12ABC34501D')).toThrow(RangeError);
  });
});

describe('validateCnpj', () => {
  it.each([
    ['12ABC34501DE35'],
    ['12.ABC.345/01DE-35'],
    ['12.abc.345/01de-35'],
    ['00.000.000/E08G-12'],
    ['90.731.548/9998-94'],
  ])('accepts %s and returns the canonical form', (input) => {
    const r = validateCnpj(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatch(/^[0-9A-Z]{12}[0-9]{2}$/);
  });

  it('canonicalises to 14 uppercase characters without a mask', () => {
    const r = validateCnpj('12.abc.345/01de-35');
    expect(r).toEqual({ ok: true, value: '12ABC34501DE35' });
  });

  it.each([
    ['12ABC34501DE36', 'wrong second digit'],
    ['12ABC34501DE45', 'wrong first digit'],
    ['12ABC34501DE3A', 'letter in a check digit'],
    ['12ABC34501DE3', 'too short'],
    ['12ABC34501DE355', 'too long'],
    ['12ABC34501D!35', 'invalid character'],
    ['00000000000000', 'all-equal sequence'],
    ['', 'empty'],
  ])('rejects %s (%s) with INVALID and never throws', (input) => {
    const r = validateCnpj(input);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID');
      expect(r.error.recoverable).toBe(false);
      expect(r.error.message).not.toContain(input || '\u0000');
    }
  });
});

describe('formatCnpj', () => {
  it('formats with the AA.AAA.AAA/AAAA-DD mask', () => {
    expect(formatCnpj('12ABC34501DE35' as Cnpj)).toBe('12.ABC.345/01DE-35');
  });
});

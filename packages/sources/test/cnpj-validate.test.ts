import { describe, expect, it } from 'vitest';
import { type Cnpj, cnpjCheckDigits, formatCnpj, validateCnpj } from '../src/index.ts';

// Vectors from the official manual (docs/conferencias/fontes-oficiais/cnpj-alfanumerico-dv.md).
describe('cnpjCheckDigits', () => {
  it('reproduces the official Serpro/Receita example 12.ABC.345/01DE-35', () => {
    expect(cnpjCheckDigits('12ABC34501DE')).toBe('35');
  });

  it('matches the first alphanumeric CNPJ issued (00.000.000/E08G-12)', () => {
    expect(cnpjCheckDigits('00000000E08G')).toBe('12');
  });

  it('keeps the classic numeric algorithm for digit-only CNPJs', () => {
    // 11.222.333/0001-81 is the textbook example of the numeric algorithm.
    expect(cnpjCheckDigits('112223330001')).toBe('81');
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
    ['11.222.333/0001-81'],
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

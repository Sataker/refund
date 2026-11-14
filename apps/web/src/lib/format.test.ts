import { describe, expect, it } from 'vitest';
import {
  formatBRL,
  formatBRLThousands,
  formatBRLWhole,
  formatRateDecimal,
  formatRatePercent,
  formatYearMonth,
  moneyParts,
  speakBRL,
} from './format.ts';

const T = ' ';

describe('moneyParts', () => {
  it('splits cents exactly, with pt-BR grouping', () => {
    expect(moneyParts(6231892)).toEqual({ negative: false, reais: '62.318', cents: '92' });
    expect(moneyParts(19893840)).toEqual({ negative: false, reais: '198.938', cents: '40' });
    expect(moneyParts(5)).toEqual({ negative: false, reais: '0', cents: '05' });
    expect(moneyParts(-111170)).toEqual({ negative: true, reais: '1.111', cents: '70' });
  });

  it('refuses non-integer cents', () => {
    expect(() => moneyParts(1.5)).toThrow(RangeError);
    expect(() => moneyParts(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });
});

describe('formatters', () => {
  it('formats BRL with a thin non-breaking space', () => {
    expect(formatBRL(6231892)).toBe(`R$${T}62.318,92`);
    expect(formatBRL(-100)).toBe(`−R$${T}1,00`);
    expect(formatBRLWhole(7400628)).toBe(`R$${T}74.006`);
  });

  it('short form truncates (never rounds up a promise)', () => {
    expect(formatBRLThousands(6231892)).toBe(`R$${T}62,3 mil`);
    expect(formatBRLThousands(7400628)).toBe(`R$${T}74 mil`);
    expect(formatBRLThousands(19893840)).toBe(`R$${T}198,9 mil`);
  });

  it('speaks the value for screen readers', () => {
    expect(speakBRL(6231892)).toBe('62.318 reais e 92 centavos');
    expect(speakBRL(100)).toBe('1 real');
  });

  it('formats competence months and decimal rates', () => {
    expect(formatYearMonth('2027-04')).toBe('abr/2027');
    expect(() => formatYearMonth('2027-13')).toThrow(RangeError);
    expect(formatRateDecimal('0.28')).toBe('0,28');
    expect(formatRatePercent('0.27722')).toBe('27,72%');
    expect(formatRatePercent('0.28')).toBe('28%');
    expect(formatRatePercent('0.105')).toBe('10,5%');
    expect(formatRatePercent('1')).toBe('100%');
    expect(() => formatRatePercent('abc')).toThrow(RangeError);
  });
});

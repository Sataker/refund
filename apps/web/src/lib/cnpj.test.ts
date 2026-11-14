import { describe, expect, it } from 'vitest';
import { cnpjHint, cnpjStatus, maskCnpj, normalizeCnpj } from './cnpj.ts';

// Synthetic CNPJs only (CLAUDE.md rule 4): the hero persona's alphanumeric one and a numeric one
// built from zeros (valid check digits, no real company behind it).
const HERO = 'RFDEV001000158';

describe('normalizeCnpj', () => {
  it('accepts pasting with punctuation and lowercase', () => {
    expect(normalizeCnpj('rf.dev.001/0001-58')).toBe(HERO);
  });

  it('rejects letters in the check-digit positions and caps the length', () => {
    expect(normalizeCnpj('RFDEV0010001AB')).toBe('RFDEV0010001');
    expect(normalizeCnpj(`${HERO}999`)).toBe(HERO);
  });
});

describe('maskCnpj', () => {
  it('masks partial and complete input', () => {
    expect(maskCnpj('RFD')).toBe('RF.D');
    expect(maskCnpj(HERO)).toBe('RF.DEV.001/0001-58');
  });
});

describe('cnpjStatus', () => {
  it('validates the alphanumeric check digits', () => {
    expect(cnpjStatus(HERO)).toEqual({ kind: 'valid', cnpj: HERO });
    expect(cnpjStatus('RFDEV001000159')).toEqual({ kind: 'invalid' });
  });

  it('counts what is missing and rejects repeated characters', () => {
    expect(cnpjStatus('')).toEqual({ kind: 'empty' });
    expect(cnpjStatus('RFDEV001000')).toEqual({ kind: 'incomplete', missing: 3 });
    expect(cnpjStatus('00000000000000')).toEqual({ kind: 'invalid' });
  });

  it('gives the hint in Portuguese', () => {
    expect(cnpjHint({ kind: 'incomplete', missing: 3 })).toBe('Faltam 3 dígitos');
    expect(cnpjHint({ kind: 'incomplete', missing: 1 })).toBe('Falta 1 dígito');
    expect(cnpjHint({ kind: 'valid', cnpj: HERO })).toBeNull();
  });
});

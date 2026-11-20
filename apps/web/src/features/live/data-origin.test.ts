import { describe, expect, it } from 'vitest';
import {
  bankBannerText,
  bankSourceOf,
  exampleFor,
  exampleText,
  exampleTitle,
  isExampleBank,
  liveSealLabel,
  PUBLIC_LIVE_LABEL,
  SAMPLE_BANK_LABEL,
  SYNTHETIC_LIVE_LABEL,
  trackOrigin,
} from './data-origin';

describe('data origin of a live analysis (C2)', () => {
  it('the sample persona wins over the sandbox; nothing connected is none', () => {
    expect(bankSourceOf(['pluggy', 'persona'])).toBe('sample');
    expect(bankSourceOf(['replay'])).toBe('sample');
    expect(bankSourceOf(['pluggy'])).toBe('sandbox');
    expect(bankSourceOf([])).toBe('none');
  });

  it('a real company with the sample statements gets the Marina banner', () => {
    const origin = { companySynthetic: false, companyIsSample: false, bank: 'sample' } as const;
    expect(bankBannerText(origin, 'Padaria Real')).toBe(
      'Extrato de exemplo (Marina, empresa fictícia): os valores não são da Padaria Real.',
    );
    expect(liveSealLabel(origin)).toBe(SAMPLE_BANK_LABEL);
  });

  it('any company on the Pluggy sandbox gets the sandbox banner', () => {
    const origin = { companySynthetic: false, companyIsSample: false, bank: 'sandbox' } as const;
    expect(bankBannerText(origin, 'Padaria Real')).toBe(
      'Extrato do ambiente de testes do Open Finance: os valores não são da Padaria Real.',
    );
    expect(liveSealLabel(origin)).toBe(PUBLIC_LIVE_LABEL);
    expect(bankBannerText({ ...origin, companyIsSample: true }, 'Marina Dev')).not.toBeNull();
  });

  it("Marina's own company with her own statements: no banner, synthetic seal", () => {
    const origin = { companySynthetic: true, companyIsSample: true, bank: 'sample' } as const;
    expect(bankBannerText(origin, 'Marina Dev')).toBeNull();
    expect(liveSealLabel(origin)).toBe(SYNTHETIC_LIVE_LABEL);
  });

  it('before the run, /app reads the origin from the active track connections', () => {
    const sample = { provider: 'replay', status: 'active' };
    expect(
      trackOrigin({
        companySource: 'brasilapi',
        companyIsSample: false,
        connections: [sample, null],
      }),
    ).toEqual({ companySynthetic: false, companyIsSample: false, bank: 'sample' });
    expect(
      trackOrigin({
        companySource: 'replay',
        companyIsSample: true,
        connections: [
          { provider: 'pluggy', status: 'active' },
          { provider: 'persona', status: 'error' },
        ],
      }),
    ).toEqual({ companySynthetic: true, companyIsSample: true, bank: 'sandbox' });
    expect(
      trackOrigin({ companySource: undefined, companyIsSample: false, connections: [] }).bank,
    ).toBe('none');
  });
});

describe('example data (bug bash 20/11, C1)', () => {
  const real = { companySynthetic: false, companyIsSample: false } as const;
  it('the sample on another company and any sandbox are example data; Marina on hers is not', () => {
    expect(isExampleBank({ ...real, bank: 'sample' })).toBe(true);
    expect(isExampleBank({ ...real, bank: 'sandbox' })).toBe(true);
    expect(isExampleBank({ ...real, bank: 'none' })).toBe(false);
    expect(isExampleBank({ companySynthetic: true, companyIsSample: true, bank: 'sample' })).toBe(
      false,
    );
  });

  it('the title names the statement and keeps the company (D49)', () => {
    expect(exampleTitle({ ...real, bank: 'sample' }, 'Vaccaro')).toBe(
      'Exemplo com o extrato da Marina, aplicado às regras da Vaccaro',
    );
    expect(exampleTitle({ ...real, bank: 'sandbox' }, 'Vaccaro')).toContain(
      'extrato de testes do Open Finance',
    );
    expect(
      exampleTitle({ companySynthetic: true, companyIsSample: true, bank: 'sample' }, 'Marina'),
    ).toBeNull();
  });

  it('risk and alert texts get the prefix only on example data', () => {
    expect(exampleText('Um mês com mais de R$ 50 mil', true)).toBe(
      'No extrato de exemplo: um mês com mais de R$ 50 mil',
    );
    expect(exampleText('PIS e Cofins', true)).toBe('No extrato de exemplo: PIS e Cofins');
    expect(exampleText('Um mês', false)).toBe('Um mês');
  });
});

describe('exampleFor (R06 comes from the activity, not the example statement)', () => {
  it('keeps the prefix for statement findings and drops it for R06', () => {
    expect(exampleFor('R02', true)).toBe(true);
    expect(exampleFor('A01', true)).toBe(true);
    expect(exampleFor('R06', true)).toBe(false);
    expect(exampleFor('R02', false)).toBe(false);
  });
});

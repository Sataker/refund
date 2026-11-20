import { describe, expect, it } from 'vitest';
import {
  bankBannerText,
  bankSourceOf,
  liveSealLabel,
  PUBLIC_LIVE_LABEL,
  SAMPLE_BANK_LABEL,
  SYNTHETIC_LIVE_LABEL,
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
});

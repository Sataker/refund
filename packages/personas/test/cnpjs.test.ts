import { validateCnpj } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import { ALL_PERSONA_CNPJS, ALL_SYNTHETIC_CNPJS, PERSONA_CNPJS } from '../src/index.ts';
import { committedData } from './helpers.ts';

describe('persona CNPJs (ARCHITECTURE §7.5)', () => {
  it('are valid alphanumeric CNPJs with an RF root, branch 0001 and unique', () => {
    for (const { cnpj } of ALL_PERSONA_CNPJS) {
      expect(validateCnpj(cnpj)).toEqual({ ok: true, value: cnpj });
      expect(cnpj).toMatch(/^RF[0-9A-Z]{6}0001\d{2}$/);
    }
    expect(new Set(ALL_PERSONA_CNPJS.map((c) => c.cnpj)).size).toBe(ALL_PERSONA_CNPJS.length);
  });

  it('the CNPJ check covers the synthetic CNPJs outside the personas too (compliance G2 M2)', () => {
    const all = ALL_SYNTHETIC_CNPJS.map((c) => c.cnpj);
    for (const c of ['RFPRES01000137', 'RFNONE01000122', 'RFDEV002000100'])
      expect(all).toContain(c);
    for (const { cnpj } of ALL_SYNTHETIC_CNPJS) {
      expect(validateCnpj(cnpj)).toEqual({ ok: true, value: cnpj });
      expect(cnpj.startsWith('RF')).toBe(true);
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it('use the stable roots of §7.5', () => {
    expect(PERSONA_CNPJS.devExportador.cnpj.slice(0, 12)).toBe('RFDEV0010001');
    expect(PERSONA_CNPJS.clinicaOdonto.cnpj.slice(0, 12)).toBe('RFCLIN010001');
    expect(PERSONA_CNPJS.farmaciaBairro.cnpj.slice(0, 12)).toBe('RFFARM010001');
  });

  it('the hero company and its PJ identity use the RFDEV001 CNPJ', () => {
    const data = committedData();
    expect(data.company.cnpj).toBe(PERSONA_CNPJS.devExportador.cnpj);
    const pj = data.items.find((i) => i.holder === 'PJ');
    expect(pj?.identity.document.publicValue).toBe(PERSONA_CNPJS.devExportador.cnpj);
    expect(pj?.identity.document.mask).toBe('RF.DEV.001/0001-58');
  });
});

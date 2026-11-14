import { describe, expect, it } from 'vitest';
import {
  hero,
  heroR01Trace,
  lawChanges,
  lawProvisionCount,
  payrollWithoutProLabore,
} from './hero-data.ts';

// ENGINE-SPEC F.4: the landing shows the same numbers as the video, the dashboard and the PDF (§6.2).
describe('landing hero numbers', () => {
  it('match the pinned hero result', () => {
    expect(hero.savings12m).toBe(6231892);
    expect(hero.annualRegime).toBe(7400628);
    expect([hero.recoveryMin, hero.recoveryMax]).toEqual([3978768, 19893840]);
    expect(hero.regimeFrom).toBe('2027-04');
    expect(hero.companyName).toBe('Marina Dev Ltda');
  });

  it('the findings telescope to the total (D1), so the mockup never shows a sum the engine did not make', () => {
    const sum = hero.findings.reduce((acc, f) => acc + f.cents, 0);
    expect(sum).toBe(hero.savings12m);
    const annual = hero.findings.reduce((acc, f) => acc + f.annualRegimeCents, 0);
    expect(annual).toBe(hero.annualRegime);
  });

  it('cites provisions that exist in @refund/law', () => {
    for (const f of hero.findings) expect(f.lawRef.url).toMatch(/^https:\/\//);
    expect(lawChanges.dividends.label).toBe('Lei 9.250/1995, art. 6º-A');
    expect(lawChanges.mei.label).toBe('LC 238/2026, art. 2º');
    expect(lawChanges.meiCondition.label).toBe('LC 238/2026, art. 3º');
    expect(lawProvisionCount).toBeGreaterThan(0);
  });

  it('the R01 trace ends in the R01 finding and S0 − S1 matches it', () => {
    const byId = new Map(heroR01Trace.map((s) => [s.id, s.result.value]));
    const s0 = byId.get('R01.COST.S0');
    const s1 = byId.get('R01.COST.S1');
    expect(typeof s0 === 'number' && typeof s1 === 'number' ? s0 - s1 : null).toBe(2831652);
    expect(byId.get('R01.SAVINGS.12m')).toBe(2831652);
    expect(byId.get('R01.FATOR_R.current')).toBe('0.27722');
  });

  it('the payroll without the pró-labore comes from the engine and matches D.1 (FSo = 146.880,00)', () => {
    expect(payrollWithoutProLabore).toBe(14688000);
    const target = heroR01Trace.find((s) => s.id === 'R01.PRO_LABORE.target');
    expect(target?.inputs['limite do Anexo III']?.value).toBe('0.28');
    expect(target?.result.value).toBe(226000);
  });
});

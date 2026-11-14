// ENGINE-SPEC D.5 tests T05-01…T05-14 (T05-14: period split of decision D20) and the C.12.2 dates.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { claimFrom, claimUntil, dasDueDate, isBusinessDay, weekday } from '../../src/calendar.ts';
import { brl } from '../../src/money.ts';
import { dasByMarket, dasForPa } from '../../src/primitives/simples.ts';
import type { Cents, EngineResult, Facts, Finding } from '../../src/types.ts';
import { constant, HERO_DAS_PAID, heroFacts, OBSERVED, syntheticFacts } from './fixtures/facts.ts';

function run(f: Facts): EngineResult {
  const r = analyze(f);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
const finding = (r: EngineResult, id: string) => r.findings.find((f) => f.ruleId === id) as Finding;

describe('ENGINE-SPEC D.5 — R05 and R05-REC', () => {
  it('T05-01/T05-13: OR-SN-06 foreign market (Anexo I, own RBT12) without Cofins/PIS/ICMS → 2.154,76', () => {
    const r = dasByMarket(brl('50.000,00'), brl('1.000.000,00'), 'I', 'export', '2026-06', {
      segregateExport: true,
    });
    expect(r.subtotal).toBe(brl('2.154,76'));
    expect(r.byTax).toMatchObject({ COFINS: 0, PIS: 0, ICMS: 0 });
  });

  it('T05-02: research 02, 100% export, Anexo III, 30.000/month → 2.580,00 → 1.313,22; 15.201,36 per year', () => {
    const segregated = dasForPa({
      pa: '2026-12',
      anexo: 'III',
      domestic: { revenue: 0 as Cents, rbt12: 0 as Cents },
      export: { revenue: brl('30.000,00'), rbt12: brl('360.000,00') },
      segregateExport: true,
    });
    expect(segregated.das).toBe(brl('1.313,22'));
    const f = syntheticFacts({
      export: constant(brl('30.000,00')),
      subjectToFatorR: false,
      exportResultAbroad: true,
      dasPaid: OBSERVED.map((m, i) => ({
        pa: m,
        amount: brl('2.580,00'),
        paymentDate: `${OBSERVED[(i + 1) % 12]}-20` as `${number}-${string}-${string}`,
      })),
    });
    const r05 = finding(run(f), 'R05');
    expect(r05.annualRegimeValue).toBe(brl('15.201,36'));
    expect(r05.marginalValue12m).toBe(brl('15.201,36'));
    expect(r05.confidence).toBe('confirmed');
  });

  it('T05-03: hero in V (PA 2026-12) → 8.925,00 − 5.609,36 = 3.315,64', () => {
    const r = dasForPa({
      pa: '2026-12',
      anexo: 'V',
      domestic: { revenue: 0 as Cents, rbt12: 0 as Cents },
      export: { revenue: brl('50.000,00'), rbt12: brl('600.000,00') },
      segregateExport: true,
    });
    expect(r.byMarket.find((m) => m.market === 'export')?.byTax).toMatchObject({
      IRPJ: brl('2.142,00'),
      CSLL: brl('1.338,75'),
      CPP: brl('2.128,61'),
    });
    expect(brl('8.925,00') - r.das).toBe(brl('3.315,64'));
  });

  it('T05-04: hero in III (PA 2027-04) → 5.280,00 − 2.687,52 = 2.592,48', () => {
    const r = dasForPa({
      pa: '2027-04',
      anexo: 'III',
      domestic: { revenue: 0 as Cents, rbt12: 0 as Cents },
      export: { revenue: brl('50.000,00'), rbt12: brl('600.000,00') },
      segregateExport: true,
    });
    expect(brl('5.280,00') - r.das).toBe(brl('2.592,48'));
  });

  it('T05-05: mixed revenue (D11) → segregated 2.773,22 × unsegregated 5.280,00: 2.506,78', () => {
    const input = {
      pa: '2026-12' as const,
      anexo: 'III' as const,
      domestic: { revenue: brl('20.000,00'), rbt12: brl('240.000,00') },
      export: { revenue: brl('30.000,00'), rbt12: brl('360.000,00') },
    };
    const seg = dasForPa({ ...input, segregateExport: true });
    expect(seg.byMarket.map((m) => m.subtotal)).toEqual([brl('1.460,00'), brl('1.313,22')]);
    const notSeg = dasForPa({ ...input, segregateExport: false });
    expect(notSeg.das).toBe(brl('5.280,00'));
    expect(notSeg.das - seg.das).toBe(brl('2.506,78'));
  });

  it('T05-06: DAS paid = 5.609,36 (matches "V segregated") → already segregated: R05 null, no recovery', () => {
    const f = heroFacts();
    f.dasPaid.value = HERO_DAS_PAID.map((p) => ({ ...p, amount: brl('5.609,36') }));
    const r = run(f);
    expect(r.findings.find((x) => x.ruleId === 'R05')).toBeUndefined();
    expect(r.findings.find((x) => x.ruleId === 'R05-REC')).toBeUndefined();
    expect(r.total.recoveryRange).toBeNull();
  });

  it('T05-07: DAS paid = 7.000,00 (no hypothesis) → unknown: R05 estimated, "o contador não segregou"', () => {
    const f = heroFacts();
    f.dasPaid.value = HERO_DAS_PAID.map((p) => ({ ...p, amount: brl('7.000,00') }));
    const r = run(f);
    const r05 = finding(r, 'R05');
    expect(r05.confidence).toBe('estimated');
    expect(r05.assumptionsUsed).toContain('o contador não segregou');
    expect(r05.range).toEqual([r05.marginalValue12m, r05.marginalValue12m]);
    expect(r.total.byConfidence.estimated).toBe(r05.marginalValue12m);
    // Recovery needs a measured PA inferred as "did not segregate": none here.
    expect(r.findings.find((x) => x.ruleId === 'R05-REC')).toBeUndefined();
  });

  it('T05-08: the user answers "o resultado é no Brasil" → not an export: R05 null', () => {
    const f = heroFacts();
    f.qualifications.exportResultAbroad = { value: false, provenance: { origin: 'user' } };
    const r = run(f);
    expect(r.findings.find((x) => x.ruleId === 'R05')).toBeUndefined();
    expect(r.findings.find((x) => x.ruleId === 'R05-REC')).toBeUndefined();
  });

  it('T05-09: hero recovery → [39.787,68; 198.938,40]; RFB up to 97.193,40; city hall up to 101.745,00', () => {
    const rec = finding(run(heroFacts()), 'R05-REC');
    expect(rec.range).toEqual([brl('39.787,68'), brl('198.938,40')]);
    expect(rec.byDestination?.federal).toEqual([brl('19.438,68'), brl('97.193,40')]);
    expect(rec.byDestination?.municipal).toEqual([brl('20.349,00'), brl('101.745,00')]);
    expect(rec.countsInTotal).toBe(false);
  });

  it('T05-10 (CTN art. 210; Lei 810/1949): paid 12/11/2021 inside; 11/11/2021 outside; PA 2021-10 → 23/11/2026', () => {
    const analysis = '2026-11-12';
    expect(claimUntil('2021-11-12', '2021-10') >= analysis).toBe(true);
    expect(claimUntil('2021-11-11', '2021-10') >= analysis).toBe(false);
    expect(dasDueDate('2021-10')).toBe('2021-11-22'); // 20/11/2021 was a Saturday
    expect(claimUntil(dasDueDate('2021-10'), '2021-10')).toBe('2026-11-23');
    // T12-08: on 13/11/2026 the payment of 12/11/2021 is out.
    expect(claimUntil('2021-11-12', '2021-10') >= '2026-11-13').toBe(false);
    // T12-09: 29/02/2024 + 5 years → 01/03/2029 (Lei 810, art. 3º), a Thursday.
    expect(claimUntil('2024-02-29', '2024-01')).toBe('2029-03-01');
    // T12-03: claimFrom = PA + 4 months.
    expect(claimFrom('2024-09')).toBe('2025-01');
    expect(claimFrom('2026-08')).toBe('2026-12');
    // T12-04: DAS of PA 2026-12 due 2027-01-20 (a Wednesday).
    expect(dasDueDate('2026-12')).toBe('2027-01-20');
    expect(weekday('2027-01-20')).toBe(3);
    // 20/11 is a national holiday from 2024 on (Lei 14.759/2023), not in 2021.
    expect(isBusinessDay('2026-11-20')).toBe(false);
    expect(isBusinessDay('2026-12-25')).toBe(false);
  });

  it('T05-11: PA 2027 (new apportionment), Anexo III 3rd bracket → segregated 2.687,52 (same as 2026)', () => {
    const r = dasForPa({
      pa: '2027-04',
      anexo: 'III',
      domestic: { revenue: 0 as Cents, rbt12: 0 as Cents },
      export: { revenue: brl('50.000,00'), rbt12: brl('600.000,00') },
      segregateExport: true,
    });
    expect(r.das).toBe(brl('2.687,52'));
    expect(r.byMarket.find((m) => m.market === 'export')?.byTax).toMatchObject({
      CBS: 0,
      IBS: 0,
      ISS: 0,
    });
  });

  it('T05-12: ISS cap (Anexo III, 5th bracket), RBT12 3.000.000, RPA 100.000 → 16.811,99 − 9.040,90 = 7.771,09', () => {
    const base = { pa: '2026-12' as const, anexo: 'III' as const };
    const notSeg = dasForPa({
      ...base,
      domestic: { revenue: brl('100.000,00'), rbt12: brl('3.000.000,00') },
    });
    expect(notSeg.byMarket[0]?.byTax).toEqual({
      ISS: brl('5.000,00'),
      IRPJ: brl('711,08'),
      CSLL: brl('621,31'),
      COFINS: brl('2.277,35'),
      PIS: brl('493,74'),
      CPP: brl('7.708,51'),
    });
    expect(notSeg.das).toBe(brl('16.811,99'));
    const seg = dasForPa({
      ...base,
      domestic: { revenue: 0 as Cents, rbt12: 0 as Cents },
      export: { revenue: brl('100.000,00'), rbt12: brl('3.000.000,00') },
      segregateExport: true,
    });
    expect(seg.das).toBe(brl('9.040,90'));
    expect(notSeg.das - seg.das).toBe(brl('7.771,09'));
  });

  it('T05-14 (D20): PA 2026-12 removes Cofins/PIS/ISS; PA 2027-01 removes CBS/IBS/ISS; 3.315,64 in both', () => {
    const at = (pa: '2026-12' | '2027-01', segregateExport: boolean) =>
      dasForPa({
        pa,
        anexo: 'V',
        domestic: { revenue: 0 as Cents, rbt12: 0 as Cents },
        export: { revenue: brl('50.000,00'), rbt12: brl('600.000,00') },
        segregateExport,
      });
    const nb2026 = at('2026-12', false).byMarket[0]?.byTax;
    expect(nb2026).toMatchObject({
      COFINS: brl('1.331,61'),
      PIS: brl('288,28'),
      ISS: brl('1.695,75'),
    });
    const nb2027 = at('2027-01', false).byMarket[0]?.byTax;
    expect(nb2027).toMatchObject({ CBS: brl('1.602,04'), IBS: brl('17,85'), ISS: brl('1.695,75') });
    for (const pa of ['2026-12', '2027-01'] as const) {
      expect(at(pa, true).das).toBe(brl('5.609,36'));
      expect(at(pa, false).das - at(pa, true).das).toBe(brl('3.315,64'));
    }
    const r05 = finding(run(heroFacts()), 'R05');
    expect(r05.trace.find((s) => s.id === 'R05.DAS.2026-12')?.formula).toContain(
      'Cofins, PIS, IPI, ICMS, ISS',
    );
    expect(r05.trace.find((s) => s.id === 'R05.DAS.2027-01')?.formula).toContain(
      'CBS, IBS, IPI, ICMS, ISS',
    );
    expect(r05.assumptionsUsed).toContain('a empresa não optou por recolher IBS e CBS fora do DAS');
  });

  it('R05 does not fire without export revenue in the statement', () => {
    const r = run(
      syntheticFacts({ domestic: constant(brl('50.000,00')), exportResultAbroad: true }),
    );
    expect(r.findings.find((x) => x.ruleId === 'R05')).toBeUndefined();
  });
});

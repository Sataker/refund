// ENGINE-SPEC D.6 tests T06-01…T06-12 (pharmacy, Anexo I, RBT12 600.000 → 3rd bracket, effective
// (57.000 − 13.860)/600.000 = 7,19%). Values in R$ written as in the spec; compared in cents.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { resolveAssumptions } from '../../src/assumptions.ts';
import { brl } from '../../src/money.ts';
import { anexoTable, dasForPa } from '../../src/primitives/simples.ts';
import { createCtx } from '../../src/projection.ts';
import { appliesR06, isManufacturerCnae, r06Finding } from '../../src/rules/r06.ts';
import type { Cents, EngineResult, Facts, Finding } from '../../src/types.ts';
import { constant, syntheticFacts } from './fixtures/facts.ts';

const PCT_40: Facts['assumptions'] = {
  monofasicoPct: { value: '0.4', origin: 'user', editable: true, source: 'slider' },
};

function pharmacy(o: { cnae?: string; assumptions?: Facts['assumptions']; regime?: 'MEI' } = {}) {
  const f = syntheticFacts({
    domestic: constant(brl('50.000,00')),
    subjectToFatorR: false,
    baseAnexo: 'I',
    ...(o.assumptions === undefined ? {} : { assumptions: o.assumptions }),
    ...(o.regime === undefined ? {} : { regime: o.regime }),
  });
  f.company.value.primaryCnae = o.cnae ?? '4771-7/01';
  f.companyDetails.value.resellsMonofasico = true;
  return f;
}

function run(f: Facts): EngineResult {
  const r = analyze(f);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
}
const r06 = (r: EngineResult) => r.findings.find((f) => f.ruleId === 'R06') as Finding | undefined;

const das = (pa: '2026-12' | '2027-06', pct?: string) =>
  dasForPa({
    pa,
    anexo: 'I',
    domestic: { revenue: brl('50.000,00'), rbt12: brl('600.000,00') },
    ...(pct === undefined ? {} : { segregateMonofasico: true, monofasicoPct: pct as never }),
  });

describe('ENGINE-SPEC D.6 — R06', () => {
  it('T06-01: 50.000/month, 40% → Cofins 183,20 + PIS 39,69 = 222,89 per PA; × 12 = 2.674,68', () => {
    const full = das('2026-12').byMarket[0];
    const seg = das('2026-12', '0.4').byMarket[0];
    expect(full?.effectiveRate).toBe('0.0719');
    const cofins = (full?.byTax.COFINS ?? 0) - (seg?.byTax.COFINS ?? 0);
    const pis = (full?.byTax.PIS ?? 0) - (seg?.byTax.PIS ?? 0);
    expect(cofins).toBe(brl('183,20'));
    expect(pis).toBe(brl('39,69'));
    expect(das('2026-12').das - das('2026-12', '0.4').das).toBe(brl('222,89'));
    expect(12 * (cofins + pis)).toBe(brl('2.674,68'));
  });

  it('T06-02: no pct provided → alert finding without R$', () => {
    const f = r06(run(pharmacy()));
    expect(f?.type).toBe('alert');
    expect(f?.marginalValue12m).toBe(0);
    expect(f?.countsInTotal).toBe(false);
    expect(f?.title).toContain('responda 1 pergunta');
  });

  it('T06-03: CNAE 2121-1/01 (manufacture of medicines) → null', () => {
    expect(isManufacturerCnae('2121-1/01')).toBe(true);
    expect(r06(run(pharmacy({ cnae: '2121-1/01', assumptions: PCT_40 })))).toBeUndefined();
  });

  it('T06-04: CNAEs 4771-7/01, 4772-5/00, 4530-7/03, 4731-8/00 → trigger yes', () => {
    for (const cnae of ['4771-7/01', '4772-5/00', '4530-7/03', '4731-8/00']) {
      const f = pharmacy({ cnae });
      expect(appliesR06(createCtx(f, resolveAssumptions(f)))).toBe(true);
    }
  });

  it('T06-05: CNAE 6201-5/01 (outside list E.5) → null', () => {
    const f = syntheticFacts({ domestic: constant(brl('50.000,00')), assumptions: PCT_40 });
    expect(r06(run(f))).toBeUndefined();
  });

  it('T06-06: horizon dec/26–nov/27, 40% → only PA 2026-12 has PIS/Cofins: 222,89 in 12 months, 0 at steady state', () => {
    const f = r06(run(pharmacy({ assumptions: PCT_40 })));
    expect(f?.annualRegimeValue).toBe(0);
    expect(f?.trace.find((s) => s.id === 'R06.GAIN_12M')?.result.value).toBe(brl('222,89'));
    expect(f?.trace.filter((s) => s.id.startsWith('R06.DAS.')).map((s) => s.month)).toEqual([
      '2026-12',
    ]);
    // 2027 tables: PIS and Cofins become CBS and IBS, which the monofásico exclusion does not reach (§9, E1/E8).
    expect(das('2027-06').das).toBe(das('2027-06', '0.4').das);
  });

  it('T06-06 (D25): R06 stays outside the total from 2027: value 0, "não compensa" with the 12-month 222,89 in the text', () => {
    const r = run(pharmacy({ assumptions: PCT_40 }));
    const f = r06(r);
    expect(f?.marginalValue12m).toBe(0);
    expect(f?.countsInTotal).toBe(false);
    expect(f?.title).toBe(
      'Separar a receita monofásica não compensa: só R$ 222,89 a menos nos próximos 12 meses e nada por ano depois da mudança (fora do total).',
    );
    expect(r.total.savings12m).toBe(0);
  });

  it('T06-07: 6th bracket (RBT12 4.000.000) → removable share 28,27 + 6,13 = 34,40%', () => {
    const sixth = anexoTable('I', '2026-12').value.brackets[5];
    expect(Number(sixth?.apportionment.COFINS) + Number(sixth?.apportionment.PIS)).toBeCloseTo(
      34.4,
      10,
    );
    expect(sixth?.apportionment.COFINS).toBe('28.27');
    expect(sixth?.apportionment.PIS).toBe('6.13');
  });

  it.todo(
    'T06-08: R06-REC recovery of 12 measured PAs at 40% (range 30–50%) — not specified enough to code: the C.3.7 inference has no monofásico hypothesis and the range composition is open (EXECUTION §9, E8 row)',
  );

  it('T06-09: MEI pharmacy → null (fixed DAS-MEI)', () => {
    expect(r06(run(pharmacy({ regime: 'MEI', assumptions: PCT_40 })))).toBeUndefined();
  });

  it('T06-10: 100% monofásico → PIS and Cofins of the PA are 0 when segregated', () => {
    const seg = das('2026-12', '1').byMarket[0];
    expect(seg?.byTax.PIS).toBe(0);
    expect(seg?.byTax.COFINS).toBe(0);
    const full = das('2026-12').byMarket[0];
    expect(das('2026-12').das - das('2026-12', '1').das).toBe(
      (full?.byTax.PIS ?? 0) + (full?.byTax.COFINS ?? 0),
    );
  });

  it('T06-11: ICMS-ST is not computed; the finding notes it', () => {
    const f = r06(run(pharmacy({ assumptions: PCT_40 })));
    expect(f?.assumptionsUsed).toContain('Também pode haver ICMS-ST (não calculado aqui).');
    expect(f?.confidence).toBe('estimated');
    expect(f?.range).toEqual([f?.marginalValue12m, f?.marginalValue12m]);
  });

  it('T06-12: supermarket (4711-3/02) → trigger yes; no pct → alert without R$', () => {
    const f = r06(run(pharmacy({ cnae: '4711-3/02' })));
    expect(f?.type).toBe('alert');
    expect(f?.marginalValue12m).toBe(0 as Cents);
  });

  it('outside the total, the finding still closes its trace; a counted R06 carries its gain and regimeFrom', () => {
    const facts = pharmacy({ assumptions: PCT_40 });
    const f = r06(run(facts));
    expect(f?.countsInTotal).toBe(false);
    expect(f?.trace.at(-1)?.result.value).toBe(f?.marginalValue12m);
    // The counted path (a steady-state gain ≥ R$ 1,00 needs PIS/Cofins in the steady-state block, which the 2027
    // tables no longer have): checked on the finding builder itself.
    const ctx = createCtx(facts, resolveAssumptions(facts));
    const sim = {
      horizon: [],
      cost12m: { total: 1000 },
      regimeCost: { total: 900 },
      regimeFrom: '2027-01',
    };
    const next = {
      horizon: [],
      cost12m: { total: 700 },
      regimeCost: { total: 600 },
      regimeFrom: '2027-01',
    };
    const counted = r06Finding(
      ctx,
      sim as never,
      next as never,
      { gain12m: 300 as Cents, regimeGain: 300 as Cents },
      true,
    );
    expect(counted.countsInTotal).toBe(true);
    expect(counted.marginalValue12m).toBe(300);
    expect(counted.annualRegimeValue).toBe(300);
    expect(counted.regimeFrom).toBe('2027-01');
    expect(counted.title).toBe(
      'Separe a receita monofásica no PGDAS-D: R$ 3,00 a menos nos próximos 12 meses (estimativa com 40% das vendas)',
    );
  });
});

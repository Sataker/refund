// Hero persona to the cent (ENGINE-SPEC F.3/F.4; D15). Oracle: F.3/F.4 and the answer key
// (packages/personas/data/dev-exportador.answer-key.json#total, #expectedFindings). Never adjust an expected value.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/analyze.ts';
import { resolveAssumptions } from '../../src/assumptions.ts';
import { createCtx } from '../../src/projection.ts';
import { regimeCostOf } from '../../src/scenario.ts';
import type { Cents, EngineResult, Finding } from '../../src/types.ts';
import { heroFacts } from './fixtures/facts.ts';

function run(): EngineResult {
  const r = analyze(heroFacts());
  if (!r.ok) throw new Error(`${r.error.code}: ${JSON.stringify(r.error.detail)}`);
  return r.value;
}
const find = (r: EngineResult, id: string) => r.findings.find((f) => f.ruleId === id) as Finding;

describe('hero: the four video numbers (F.4)', () => {
  const r = run();

  it('62.318,92 over the next 12 months (dec/2026–nov/2027)', () => {
    expect(r.total.savings12m).toBe(6231892);
  });

  it('74.006,28 per year at steady state', () => {
    expect(r.total.annualRegimeSavings).toBe(7400628);
  });

  it('recovery range [39.787,68; 198.938,40], outside the big number', () => {
    expect(r.total.recoveryRange).toEqual([3978768, 19893840]);
  });

  it('R02 financial cost 1.111,70 (withheld 9.000,00 in jul/2026)', () => {
    const r02 = find(r, 'R02');
    expect(r02.marginalValue12m).toBe(111170);
    expect(r02.countsInTotal).toBe(false);
    expect(r02.type).toBe('alert');
    expect(r02.confidence).toBe('estimated');
    expect(r02.title).toContain('9.000,00');
    expect(r02.title).toContain('2 × R$ 45.000,00');
  });

  it('byConfidence: everything confirmed (answer key #total)', () => {
    expect(r.total.byConfidence).toEqual({
      confirmed: 6231892,
      estimated: 0,
      depends_on_regulation: 0,
    });
  });
});

describe('hero: findings rule by rule (F.3)', () => {
  const r = run();

  it('R01 (T01-07): 28.316,52 in 12 months, 42.896,52 per year, from 2027-04, P* 2.260,00', () => {
    const f = find(r, 'R01');
    expect(f.marginalValue12m).toBe(2831652);
    expect(f.annualRegimeValue).toBe(4289652);
    expect(f.regimeFrom).toBe('2027-04');
    expect(f.confidence).toBe('confirmed');
    expect(f.countsInTotal).toBe(true);
    expect(f.title).toBe(
      'Ajuste o pró-labore para R$ 2.260,00/mês e pague o Simples pelo Anexo III a partir de 04/2027',
    );
    const step = (id: string) => f.trace.find((s) => s.id === id)?.result.value;
    expect(step('R01.P_TARGET')).toBe(226000);
    expect(step('R01.P_28')).toBe(176000);
    expect(step('R01.FS12_WITHOUT_PRO_LABORE')).toBe(14688000);
    expect(step('R01.COST_12M_BEFORE')).toBe(10923972);
    expect(step('R01.COST_12M_AFTER')).toBe(8092320);
  });

  it('R01 PA-by-PA table (F.3, step 3): windows, FS12, displayed Fator R, anexo and DAS', () => {
    const f = find(r, 'R01');
    const rows = f.trace.filter((s) => s.id.startsWith('R01.PA.'));
    expect(rows.map((s) => s.month)).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
      '2027-09',
      '2027-10',
      '2027-11',
    ]);
    const fs12 = [
      166332, 166332, 166971, 167610, 168249, 168888, 169527, 170166, 170805, 171444, 172083,
      172722,
    ];
    rows.forEach((s, i) => {
      expect(s.inputs.fs12?.value).toBe((fs12[i] as number) * 100);
      expect(s.inputs.rbt12?.value).toBe(60000000);
      expect(s.result.value).toBe(i < 4 ? 892500 : 528000);
      expect(s.inputs.anexo?.value).toBe(i < 4 ? 'V' : 'III');
    });
    expect(rows[0]?.inputs.windowFrom?.value).toBe('2025-12');
    expect(rows[1]?.inputs.windowFrom?.value).toBe('2025-12'); // Res. CGSN 190: same window (T01-08)
    expect(rows[1]?.inputs.windowTo?.value).toBe('2026-11');
    expect(rows[2]?.inputs.windowFrom?.value).toBe('2026-01');
    expect(rows[3]?.inputs.fatorR?.value).toBe('0.27');
    expect(rows[4]?.inputs.fatorR?.value).toBe('0.28');
  });

  it('R01 curve (T01-17): 1.621 → 69.452,04; 1.760 → 34.573,44; 2.260 → 35.233,44; 3.000 → 36.210,24', () => {
    const at = (p: number) =>
      r.optimizerCurve?.find((c) => c.monthlyProLabore === p)?.annualTotalCost;
    expect(at(162100)).toBe(6945204);
    expect(at(176000)).toBe(3457344);
    expect(at(226000)).toBe(3523344);
    // 3.000 is not on the R$ 50 grid (SM + 50·k up to 1,2 × P_target): its steady-state cost, computed directly.
    const ctx = createCtx(heroFacts(), resolveAssumptions(heroFacts()));
    const d = {
      proLabore: 300000 as Cents,
      segregateExport: true,
      segregateMonofasico: false,
      pgblContribution: {},
    };
    expect(regimeCostOf(ctx, d).total).toBe(3621024);
  });

  it('R05 (T05-03/T05-04): 34.002,40 in 12 months and 31.109,76 per year, confirmed', () => {
    const f = find(r, 'R05');
    expect(f.marginalValue12m).toBe(3400240);
    expect(f.annualRegimeValue).toBe(3110976);
    expect(f.confidence).toBe('confirmed');
    expect(f.countsInTotal).toBe(true);
    const das = (pa: string) => f.trace.find((s) => s.id === `R05.DAS.${pa}`);
    expect(das('2026-12')?.result.value).toBe(560936);
    expect(das('2026-12')?.inputs.dasNotSegregated?.value).toBe(892500);
    expect(das('2027-04')?.result.value).toBe(268752);
    // D20: each PA cites the exclusion of its own period.
    expect(das('2026-12')?.ref?.id).toBe('res-cgsn140-2018/art25/p3');
    expect(das('2027-01')?.ref?.id).toBe('res-cgsn190-2026/art1/res140-art25');
  });

  it('PGDAS-D inference (C.3.7, F.3 step 0): V, did not segregate, in the 12 PAs', () => {
    const f = find(r, 'R05');
    const inf = f.trace.filter((s) => s.id.startsWith('PGDAS.INFERENCE.'));
    expect(inf).toHaveLength(12);
    for (const s of inf) {
      expect(s.result.value).toBe('Anexo V, não segregou a exportação');
      expect(s.inputs.V_not_segregated?.value).toBe(892500);
      expect(s.inputs.V_segregated?.value).toBe(560936);
      expect(s.inputs.III_not_segregated?.value).toBe(528000);
      expect(s.inputs.III_segregated?.value).toBe(268752);
    }
  });

  it('R06 and R04 do not fire (F.3 steps 5–6; T04-12: RT 2026 = 20.091 ≤ 60.000)', () => {
    expect(r.findings.find((f) => f.ruleId === 'R06')).toBeUndefined();
    expect(r.findings.find((f) => f.ruleId === 'R04')).toBeUndefined();
  });

  it('R05-REC (T05-09): 12 measured + 48 projected, RFB up to 97.193,40, city hall up to 101.745,00', () => {
    const f = find(r, 'R05-REC');
    expect(f.type).toBe('recovery');
    expect(f.confidence).toBe('estimated');
    expect(f.countsInTotal).toBe(false);
    expect(f.range).toEqual([3978768, 19893840]);
    expect(f.byDestination).toEqual({
      federal: [1943868, 9719340],
      municipal: [2034900, 10174500],
      state: [0, 0],
    });
    expect(f.deadline).toBe('2026-11-23');
    const items = f.recoveryItems ?? [];
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.measured)).toHaveLength(12);
    expect(
      items
        .filter((i) => !i.measured)
        .map((i) => i.pa)
        .sort()[0],
    ).toBe('2021-10');
    expect(items[0]).toMatchObject({
      pa: '2021-10',
      measured: false,
      paymentDate: null,
      claimUntil: '2026-11-23',
      federal: 161989,
      iss: 169575,
    });
    const measured = items.filter((i) => i.measured);
    expect(measured.reduce((a, i) => a + i.federal, 0)).toBe(1943868);
    expect(measured.reduce((a, i) => a + i.iss, 0)).toBe(2034900);
    // C.12.4: on 12/11/2026 one can claim up to PA 07/2026; 08/2026 from 12/2026; 09/2026 from 01/2027.
    expect(measured.find((i) => i.pa === '2026-08')?.claimFrom).toBe('2026-12');
    expect(measured.find((i) => i.pa === '2026-09')?.claimFrom).toBe('2027-01');
  });

  it('C.1 item 4: the trace flags the 2027–2028 parameters not yet published (engine review of E5)', () => {
    const steps = r.findings.flatMap((f) => f.trace);
    const notes = steps.filter((s) => s.projectedNote !== undefined);
    expect(notes.length).toBeGreaterThanOrEqual(1);
    expect(notes.map((s) => s.projectedNote)).toContain(
      'parâmetro de 2027 ainda não publicado; usado o de 2026',
    );
    const r01 = find(r, 'R01').trace.find((s) => s.id === 'R01.PROJECTED_PARAMETERS');
    expect(r01?.inputs['inss.ceiling']?.value).toBe('2027-01 a 2028-12: usado o de 2026');
    expect(r01?.inputs['irpf.annual.table']?.value).toBe('2027-12 a 2028-12: usado o de 2026');
    expect(r01?.inputs.minimumWage).toBeUndefined(); // read at start = 2026-12, published
  });

  it('INV-1: Σ marginals (countsInTotal) == total, 12 months and steady state', () => {
    const counted = r.findings.filter((f) => f.countsInTotal);
    expect(counted.map((f) => f.ruleId)).toEqual(['R01', 'R05']);
    expect(counted.reduce((a, f) => a + f.marginalValue12m, 0)).toBe(r.total.savings12m);
    expect(counted.reduce((a, f) => a + (f.annualRegimeValue ?? 0), 0)).toBe(
      r.total.annualRegimeSavings,
    );
  });

  it('findings sorted by order; every finding cites corpus-style refs and closes its trace', () => {
    expect(r.findings.map((f) => f.ruleId)).toEqual(['R01', 'R05', 'R05-REC', 'R02']);
    for (const f of r.findings) {
      expect(f.refs.length).toBeGreaterThan(0);
      for (const ref of f.refs) expect(ref.id).toMatch(/^[a-z0-9-]+\/[a-z0-9/-]+$/);
      const last = f.trace.at(-1)?.result.value;
      expect(last).toBe(f.type === 'recovery' ? f.range?.[1] : f.marginalValue12m);
      if (f.type === 'savings') {
        expect(f.doNot.length).toBeGreaterThan(0);
        expect(f.tradeoffs.length).toBeGreaterThan(0);
      }
    }
  });
});

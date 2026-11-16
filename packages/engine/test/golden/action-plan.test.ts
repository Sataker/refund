// ENGINE-SPEC C.12.5 and EXECUTION E8b: the action plan of every finding ("o que, quem, onde, quando, qual lei").
// T12-01…T12-09 as in C.12.5; T12-10 (the five questions), T12-11 (no free digits), T12-12 / INV-12 (refs exist).
import { describe, expect, it } from 'vitest';
import { actionRefOf, buildActionPlan, resolvePlaceholders } from '../../src/actions/build.ts';
import { CATALOG, NO_SOURCE_TEXT, type RuleKey } from '../../src/actions/catalog.ts';
import { analyze, recalculate } from '../../src/analyze.ts';
import {
  claimFrom,
  claimUntil,
  dasDueDate,
  daysBetween,
  esocialDueDate,
  inssDueDate,
  isBusinessDay,
  previousBusinessDay,
  secondDecendioLastBusinessDay,
  weekday,
} from '../../src/calendar.ts';
import { formatBrl } from '../../src/rules/common.ts';
import { addMonths, daysInMonth } from '../../src/time.ts';
import type { Cents, CivilDate, EngineResult, Facts, Finding, YearMonth } from '../../src/types.ts';
import { heroFacts } from './fixtures/facts.ts';
import { LAW } from './fixtures/law-corpus.ts';
import { profileGridFacts, ruleScenarios } from './fixtures/scenarios.ts';

const run = (facts: Facts): EngineResult => {
  const r = analyze(facts);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const hero = run(heroFacts());
const find = (res: EngineResult, ruleId: string): Finding => {
  const f = res.findings.find((x) => x.ruleId === ruleId);
  if (f === undefined) throw new Error(`${ruleId} not found`);
  return f;
};

/** Hero, the rule scenarios, the hero outside São Paulo, and every C.11 grid point. */
const ALL: [string, Facts][] = (() => {
  const notSp = heroFacts();
  delete notSp.company.value.ibgeMunicipality;
  const out: [string, Facts][] = [
    ['hero', heroFacts()],
    ['hero-outside-sp', notSp],
    ...Object.entries(ruleScenarios()),
  ];
  profileGridFacts().forEach((f, i) => {
    out.push([`grid-${i}`, f]);
  });
  return out;
})();
const RESULTS: [string, Facts, EngineResult][] = ALL.map(([n, f]) => [n, f, run(f)]);
const FINDINGS: [string, Facts, Finding][] = RESULTS.flatMap(([n, facts, r]) =>
  r.findings.map((f) => [n, facts, f] as [string, Facts, Finding]),
);
/** Findings that must carry a plan: every one except a savings lever the chain did not recommend. */
const PLANNED = FINDINGS.filter(([, , f]) => f.type !== 'savings' || f.countsInTotal);

const squash = (s: string) =>
  s
    .replace(/\\(?=[^\s\w])/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, '');

describe('C.12 hero (T12-01…T12-05)', () => {
  it('T12-01: R05-REC steps in the catalog order, 60 items sorted by claimUntil, measured totals', () => {
    const f = find(hero, 'R05-REC');
    expect(f.actionPlan.map((s) => s.id)).toEqual([
      'R05-REC.action.1',
      'R05-REC.action.2',
      'R05-REC.action.3',
      'R05-REC.action.4',
      'R05-REC.action.5',
      'R05-REC.action.6',
      'R05-REC.action.7',
      'R05-REC.action.8',
    ]);
    expect(f.actionPlan.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(f.actionPlan[6]?.where?.name).toBe('SAV da Prefeitura de São Paulo');
    expect(f.actionPlan[6]?.noSource).toBeUndefined();
    expect(f.howToReceive.map((h) => h.method)).toEqual([
      'refund_pix_cnpj',
      'refund_municipality',
      'offset',
    ]);
    const items = f.recoveryItems ?? [];
    expect(items).toHaveLength(60);
    expect(items.filter((i) => i.measured)).toHaveLength(12);
    const until = items.map((i) => i.claimUntil);
    expect(until).toEqual([...until].sort());
    const measured = items.filter((i) => i.measured);
    expect(measured.reduce((a, i) => a + i.federal, 0)).toBe(1943868);
    expect(measured.reduce((a, i) => a + i.iss, 0)).toBe(2034900);
    for (const i of items) {
      expect(i.daysLeft).toBe(daysBetween('2026-11-12', i.claimUntil));
      expect(i.daysLeft).toBeGreaterThanOrEqual(0);
    }
    // The federal claim (.6) and the amendment (.4) end on the earliest statute-of-limitations date.
    expect(f.actionPlan[3]?.until).toBe('2026-11-23');
    expect(f.actionPlan[5]?.until).toBe('2026-11-23');
  });

  it('T12-02: PA 10/2021 projected, due 22/11/2021, claimUntil 23/11/2026, 11 days left (urgency)', () => {
    expect(dasDueDate('2021-10')).toBe('2021-11-22');
    expect(claimUntil('2021-11-22', '2021-10')).toBe('2026-11-23');
    const top = find(hero, 'R05-REC').recoveryItems?.[0];
    expect(top).toMatchObject({
      pa: '2021-10',
      measured: false,
      paymentDate: null,
      claimUntil: '2026-11-23',
      daysLeft: 11,
    });
    expect((top?.daysLeft ?? 99) <= 30).toBe(true);
    const urgent = find(hero, 'R05-REC').recoveryItems?.filter((i) => i.daysLeft <= 30) ?? [];
    expect(urgent).toHaveLength(1);
  });

  it('T12-03: claimFrom = PA + 4 months; on 12/11/2026 claimable up to PA 07/2026', () => {
    expect(claimFrom('2024-09')).toBe('2025-01');
    expect(claimFrom('2026-08')).toBe('2026-12');
    expect(claimFrom('2026-09')).toBe('2027-01');
    const items = find(hero, 'R05-REC').recoveryItems ?? [];
    const now = items.filter((i) => i.claimFrom <= '2026-11').map((i) => i.pa);
    expect(now.sort().at(-1)).toBe('2026-07');
  });

  it('T12-04: R05 going forward: firstEffect PA 2026-12; the first smaller DAS is due 2027-01-20 (Wednesday)', () => {
    const f = find(hero, 'R05');
    expect(f.actionPlan).toHaveLength(4);
    expect(f.actionPlan[3]?.noSource).toBe(true);
    expect(f.howToReceive).toEqual([
      expect.objectContaining({ method: 'lower_tax', firstEffect: '2026-12' }),
    ]);
    const declare = f.actionPlan[1];
    expect(declare?.from).toBe('2026-12');
    expect(declare?.until).toBe('2027-01-20');
    expect(weekday('2027-01-20')).toBe(3);
  });

  it('T12-05: R01 reads P* = 2.260,00 from the trace; firstEffect PA 2027-04', () => {
    const f = find(hero, 'R01');
    const pStar = f.trace.find((s) => s.id === 'R01.P_STAR')?.result.value;
    expect(pStar).toBe(226000);
    expect(f.actionPlan.map((s) => s.id)).toEqual([
      'R01.action.1',
      'R01.action.2',
      'R01.action.3',
      'R01.action.4',
      'R01.action.7',
      'R01.action.5',
      'R01.action.6',
    ]);
    // The INSS rate of a Simples company is research 08 §11, item 5: a noSource question next to the INSS step.
    expect(f.actionPlan[4]?.noSource).toBe(true);
    expect(f.actionPlan[3]?.refIds).toContain('lei8212-1991/art30/p4');
    expect(f.actionPlan[5]?.refIds).toContain('res-cgsn140-2018/art26');
    expect(f.actionPlan[0]?.what).toContain(`R$ ${formatBrl(pStar as number)} por mês`);
    expect(f.actionPlan[0]?.what).toContain('R$ 2.260,00');
    expect(f.actionPlan[0]?.from).toBe('2026-12');
    expect(f.howToReceive).toEqual([
      expect.objectContaining({ method: 'lower_tax', firstEffect: '2027-04' }),
    ]);
    // eSocial/DCTFWeb postpone (15/01/2027 is a Friday); INSS brings forward; DAS postpones.
    expect(f.actionPlan.map((s) => s.until)).toEqual([
      undefined,
      '2027-01-15',
      '2027-01-15',
      '2027-01-20',
      undefined,
      undefined,
      '2027-01-20',
    ]);
  });

  it('R02 (D29: "como receber" below R$ 600 mil), A01, and no plan for rules that do not fire', () => {
    const r02 = find(hero, 'R02');
    expect(r02.actionPlan.map((s) => s.id)).toEqual([
      'R02.action.1',
      'R02.action.2',
      'R02.action.3',
      'R02.action.4',
    ]);
    // E3: the withholding of 07/2026 repeats in 07/2027 → DARF by the last business day of the 2nd decêndio of 08/2027.
    expect(r02.trace.some((s) => s.id === 'R02.FINANCIAL_COST.2026-07')).toBe(true);
    expect(r02.actionPlan[1]?.until).toBe('2027-08-20');
    expect(weekday('2027-08-20')).toBe(5);
    // S1: the art. 14 exemption no longer stops the withholding (P&R Altas Rendas, perg. 10).
    expect(r02.actionPlan[3]?.what).toContain('Essa isenção não evita a retenção na fonte');
    expect(r02.actionPlan[3]?.refIds).toEqual(
      expect.arrayContaining(['lei9250-1995/art6-a', 'rfb-pr-altas-rendas-2025-12-19#q10']),
    );
    expect(r02.howToReceive.map((h) => h.method)).toEqual(['irpf_refund']);
    const a01 = find(hero, 'A01');
    expect(a01.actionPlan).toHaveLength(3);
    expect(a01.actionPlan[2]?.noSource).toBe(true);
    expect(a01.howToReceive).toEqual([]);
    expect(hero.findings.map((f) => f.ruleId).sort()).toEqual(
      ['A01', 'R01', 'R02', 'R05', 'R05-REC'].sort(),
    );
  });

  it('the hero numbers are unchanged (G1)', () => {
    expect(hero.total.savings12m).toBe(6231892);
    expect(hero.total.annualRegimeSavings).toBe(7400628);
    expect(hero.total.recoveryRange).toEqual([3978768, 19893840]);
    expect(find(hero, 'R02').marginalValue12m).toBe(111170);
  });

  it('recalculate builds the same plan (same code in the browser)', () => {
    const facts = heroFacts();
    const r = recalculate(facts, facts.assumptions);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.value.findings.map((f) => [f.actionPlan, f.howToReceive])).toEqual(
      hero.findings.map((f) => [f.actionPlan, f.howToReceive]),
    );
  });
});

describe('C.12 variants', () => {
  it('outside São Paulo: the "where" is sourced (the city hall), only the "how" is a noSource question', () => {
    const [, , r] = RESULTS.find(([n]) => n === 'hero-outside-sp') as [string, Facts, EngineResult];
    const f = find(r, 'R05-REC');
    const seven = f.actionPlan[6];
    expect(seven?.id).toBe('R05-REC.action.7');
    expect(seven?.noSource).toBeUndefined();
    expect(seven?.where?.name).toBe('Prefeitura da sua cidade');
    expect(seven?.refIds).toContain('res-cgsn140-2018/art130');
    expect(f.actionPlan[7]).toMatchObject({ id: 'R05-REC.action.10', noSource: true, refIds: [] });
    expect(f.actionPlan.some((s) => s.where?.name.includes('SAV') === true)).toBe(false);
    expect(f.howToReceive.find((h) => h.method === 'refund_municipality')?.summary).toBe(
      'Pedido à prefeitura; prazo de análise não confirmado.',
    );
  });

  it('São Paulo: the ISS money arrives in the account of the SAV bank-data screen (SAV manual 15.1)', () => {
    const h = find(hero, 'R05-REC').howToReceive.find((x) => x.method === 'refund_municipality');
    expect(h?.refIds).toContain('sp-manual-sav-2.15#15.1');
    expect(h?.summary).toContain('não foi confirmado');
  });

  it('R03: the exclusion (Simples) or desenquadramento (MEI) step is sourced; the rest stays a question', () => {
    const facts = heroFacts();
    const ctx = { facts, start: '2026-12' as YearMonth };
    const [, , mei] = RESULTS.find(([n]) => n === 'mei') as [string, Facts, EngineResult];
    const r03Mei = find(mei, 'R03');
    const projected = r03Mei.trace.find((s) => s.id === 'R03.RBA_PROJ')?.result.value as number;
    const limit = r03Mei.trace.find((s) => s.id === 'R03.LIMIT')?.result.value as number;
    expect(r03Mei.actionPlan.map((s) => s.id)).toEqual(
      projected > limit ? ['R03.action.1', 'R03.action.2'] : ['R03.action.2'],
    );
    const simples = (effect: string): Finding => ({
      ...r03Mei,
      trace: [
        {
          id: 'R03.MARGINAL_12M',
          label: '',
          formula: '',
          inputs: { effect: { value: effect, unit: 'text' } },
          result: { value: 0, unit: 'cents' },
          rounding: 'NONE',
        },
      ],
    });
    const exclusion = buildActionPlan(simples('exclusion_next_year'), ctx).actionPlan;
    expect(exclusion.map((s) => s.id)).toEqual(['R03.action.1', 'R03.action.2']);
    expect(exclusion[0]?.refIds).toEqual(
      expect.arrayContaining(['lc123-2006/art30', 'pr-simples-2026-10-09#12.3']),
    );
    expect(buildActionPlan(simples('warning'), ctx).actionPlan.map((s) => s.id)).toEqual([
      'R03.action.2',
    ]);
  });

  it('R02 above the IRPFM threshold: no R02.3 and nothing to receive', () => {
    const facts = heroFacts();
    facts.pfDetails.value.projectedAnnualTotalIncome = 60000000 as Cents;
    const f = find(run(facts), 'R02');
    expect(f.actionPlan.map((s) => s.id)).not.toContain('R02.action.3');
    expect(f.howToReceive).toEqual([]);
  });

  it('conditions read from the trace and the facts (R01 lowered, ICMS, non-recommended levers)', () => {
    const facts = heroFacts();
    const ctx = { facts, start: '2026-12' as YearMonth };
    const r01 = find(hero, 'R01');
    const lowered: Finding = {
      ...r01,
      trace: r01.trace.map((s) =>
        s.id === 'R01.P_STAR'
          ? {
              ...s,
              result: { value: 162100, unit: 'cents' as const },
              inputs: { ...s.inputs, currentProLabore: { value: 500000, unit: 'cents' as const } },
            }
          : s,
      ),
    };
    expect(buildActionPlan(lowered, ctx).howToReceive.map((h) => h.summary)).toEqual([
      'Menos INSS e imposto de renda sobre o pró-labore, a partir do mês indicado.',
    ]);
    const rec = find(hero, 'R05-REC');
    const withIcms: Finding = {
      ...rec,
      byDestination: {
        federal: rec.byDestination?.federal ?? [0 as Cents, 0 as Cents],
        municipal: [0 as Cents, 0 as Cents],
        state: [100 as Cents, 200 as Cents],
      },
    };
    const plan = buildActionPlan(withIcms, ctx);
    expect(plan.actionPlan.map((s) => s.id)).toEqual([
      'R05-REC.action.1',
      'R05-REC.action.2',
      'R05-REC.action.3',
      'R05-REC.action.4',
      'R05-REC.action.5',
      'R05-REC.action.6',
      'R05-REC.action.8',
      'R05-REC.action.9',
      'R05-REC.action.11',
    ]);
    expect(plan.actionPlan[7]?.refIds).toContain('res-cgsn140-2018/art130');
    expect(plan.actionPlan[8]?.noSource).toBe(true);
    expect(plan.howToReceive.map((h) => h.method)).toEqual([
      'refund_pix_cnpj',
      'refund_state',
      'offset',
    ]);
    const notRecommended: Finding = { ...find(hero, 'R05'), countsInTotal: false };
    expect(buildActionPlan(notRecommended, ctx)).toEqual({ actionPlan: [], howToReceive: [] });
  });

  it('an unresolved placeholder is a catalog bug, never a silent text', () => {
    const r01 = find(hero, 'R01');
    expect(() => resolvePlaceholders('R$ {R01.NOPE}', r01)).toThrow(/placeholder/);
    expect(() => resolvePlaceholders('R$ {finding.trace}', r01)).toThrow(/placeholder/);
    expect(resolvePlaceholders('R$ {finding.marginalValue12m}', r01)).toBe(
      `R$ ${formatBrl(r01.marginalValue12m)}`,
    );
  });
});

describe('C.12.2 dates without the JS clock (T12-08, T12-09 and the E8b calendar)', () => {
  it('T12-08: paid 12/11/2021 is still claimable on 12/11/2026 (0 days left) and out on 13/11', () => {
    expect(claimUntil('2021-11-12', '2021-10')).toBe('2026-11-12');
    expect(isBusinessDay('2026-11-12')).toBe(true);
    expect(daysBetween('2026-11-12', '2026-11-12')).toBe(0);
    expect(daysBetween('2026-11-13', '2026-11-12')).toBe(-1);
  });

  it('T12-09: paid 29/02/2024 → 01/03/2029 (Lei 810, art. 3º), a business day', () => {
    expect(claimUntil('2024-02-29', '2024-01')).toBe('2029-03-01');
    expect(isBusinessDay('2029-03-01')).toBe(true);
  });

  it('INSS brings forward, eSocial postpones, DARF 1841 is the last business day of the 2nd decêndio', () => {
    // 20/06/2026 is a Saturday: INSS of 05/2026 → Friday 19/06; DARF of a May distribution likewise.
    expect(weekday('2026-06-20')).toBe(6);
    expect(inssDueDate('2026-05')).toBe('2026-06-19');
    expect(secondDecendioLastBusinessDay('2026-05')).toBe('2026-06-19');
    // 15/11/2026 is a Sunday (and a holiday): eSocial of 10/2026 → Monday 16/11.
    expect(esocialDueDate('2026-10')).toBe('2026-11-16');
    expect(previousBusinessDay('2026-01-01')).toBe('2025-12-31');
    expect(daysBetween('2026-11-12', '2027-11-12')).toBe(365);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });
});

describe('T12-10: every finding answers what, who, where, when and which law', () => {
  it('runs over the hero, the rule scenarios and the C.11 grid, and every rule fires somewhere', () => {
    expect(RESULTS.length).toBeGreaterThan(50);
    expect(new Set(FINDINGS.map(([, , f]) => f.ruleId))).toEqual(
      new Set(['R01', 'R02', 'R03', 'R04', 'R05', 'R05-REC', 'R06', 'A01', 'A02']),
    );
  });

  it('(a) ≥ 1 step; (b) every step has who; (c) a step says where, unless every step is noSource', () => {
    for (const [name, , f] of PLANNED) {
      const tag = `${name} ${f.ruleId}`;
      expect(f.actionPlan.length, tag).toBeGreaterThan(0);
      for (const s of f.actionPlan)
        expect(['you', 'accountant', 'you_or_accountant', 'lawyer'], tag).toContain(s.who);
      const allNoSource = f.actionPlan.every((s) => s.noSource === true);
      if (!allNoSource)
        expect(
          f.actionPlan.some((s) => s.where !== undefined),
          tag,
        ).toBe(true);
    }
  });

  it('(d) when: a step with from/until, a firstEffect, or a noSource step', () => {
    for (const [name, , f] of PLANNED) {
      const ok =
        f.actionPlan.some((s) => s.from !== undefined || s.until !== undefined) ||
        f.howToReceive.some((h) => h.firstEffect !== undefined) ||
        f.actionPlan.some((s) => s.noSource === true);
      expect(ok, `${name} ${f.ruleId}`).toBe(true);
    }
  });

  it('(e) which law: refIds ≠ [] or noSource with the fixed sentence (INV-12, T12-07)', () => {
    for (const [name, , f] of PLANNED) {
      for (const s of f.actionPlan) {
        const tag = `${name} ${s.id}`;
        if (s.noSource === true) {
          expect(s.refIds, tag).toEqual([]);
          expect(s.what.endsWith(` ${NO_SOURCE_TEXT}`), tag).toBe(true);
          // The part before the fixed sentence is a question, never a statement.
          expect(s.what.slice(0, -NO_SOURCE_TEXT.length - 1).endsWith('?'), tag).toBe(true);
        } else {
          expect(s.refIds.length, tag).toBeGreaterThan(0);
        }
      }
      for (const h of f.howToReceive)
        expect(h.refIds.length, `${name} ${f.ruleId}`).toBeGreaterThan(0);
    }
  });

  it('steps are numbered 1…n, ids unique, from ≤ until, and howToReceive is [] only for alerts and risks', () => {
    for (const [name, , f] of PLANNED) {
      const tag = `${name} ${f.ruleId}`;
      expect(
        f.actionPlan.map((s) => s.order),
        tag,
      ).toEqual(f.actionPlan.map((_, i) => i + 1));
      const ids = f.actionPlan.map((s) => s.id);
      expect(new Set(ids).size, tag).toBe(ids.length);
      for (const s of f.actionPlan) {
        expect(s.id.startsWith(`${f.ruleId}.action.`), tag).toBe(true);
        if (s.from !== undefined && s.until !== undefined)
          expect(s.from.slice(0, 7) <= s.until.slice(0, 7), tag).toBe(true);
      }
      if (f.howToReceive.length === 0) expect(['alert', 'risk'], tag).toContain(f.type);
    }
  });

  it('a savings lever the chain did not recommend carries no plan', () => {
    for (const [name, , f] of FINDINGS) {
      if (f.type === 'savings' && !f.countsInTotal)
        expect([f.actionPlan, f.howToReceive], `${name} ${f.ruleId}`).toEqual([[], []]);
    }
  });
});

describe('T12-11: no number in a step text that the trace does not hold', () => {
  const DIGIT_OUTSIDE = /\d(?![^{]*\})/;
  it('the catalog has no digit outside a {placeholder} and no date in what/summary', () => {
    for (const rule of Object.keys(CATALOG) as RuleKey[]) {
      for (const t of CATALOG[rule].steps) {
        expect(t.what, t.id).not.toMatch(DIGIT_OUTSIDE);
        expect(t.id).toMatch(new RegExp(`^${rule}\\.action\\.\\d+$`));
      }
      for (const t of CATALOG[rule].receive) expect(t.summary, rule).not.toMatch(DIGIT_OUTSIDE);
    }
  });

  it('every placeholder resolves, and every number in an emitted text is a resolved trace value', () => {
    const used = new Set<string>();
    for (const [name, , f] of PLANNED) {
      const catalog = CATALOG[f.ruleId as RuleKey];
      for (const s of f.actionPlan) {
        const t = catalog.steps.find((x) => x.id === s.id && x.noSource === s.noSource);
        const keys = [...(t?.what ?? '').matchAll(/\{([^{}]+)\}/g)].map((m) => m[1] as string);
        for (const k of keys) used.add(k);
        const allowed = keys.map((k) => resolvePlaceholders(`{${k}}`, f));
        let rest = s.what;
        for (const v of allowed) rest = rest.replace(v, '');
        expect(rest, `${name} ${s.id}`).not.toMatch(/\d/);
      }
      for (const h of f.howToReceive) expect(h.summary, `${name} ${f.ruleId}`).not.toMatch(/\d/);
    }
    expect([...used].sort()).toEqual(['R01.P_STAR', 'R04.PGBL_CONTRIBUTION']);
  });
});

describe('T12-12 / INV-12: every ref of the plan exists in @refund/law and the mirror matches it', () => {
  const refIdsOf = (f: Finding) => [
    ...f.actionPlan.flatMap((s) => s.refIds),
    ...f.howToReceive.flatMap((h) => h.refIds),
  ];

  it('every catalog ref is in the corpus (provision or procedure excerpt) with the same label, url and hash', () => {
    const ids = new Set(
      Object.values(CATALOG).flatMap((c) => [
        ...c.steps.flatMap((s) => s.refIds),
        ...c.receive.flatMap((h) => h.refIds),
      ]),
    );
    for (const id of ids) {
      const law = LAW.get(id);
      expect(law, `${id} is not in @refund/law`).toBeDefined();
      const ref = actionRefOf(id);
      expect(ref, `${id} has no engine mirror`).toBeDefined();
      expect(ref?.label, id).toBe(law?.label);
      expect(ref?.url, id).toBe(law?.url);
      expect(ref?.captureSha256, id).toBe(law?.sourceSha256);
      expect(ref?.type, id).toBe(law?.kind === 'procedure' ? 'procedure' : 'regulation');
    }
    expect(actionRefOf('nao-existe')).toBeUndefined();
  });

  it('every provision a finding cites is in force during the finding period', () => {
    const lastDay = (m: YearMonth) =>
      `${m}-${daysInMonth(Number(m.slice(0, 4)), Number(m.slice(5)))}` as CivilDate;
    for (const [name, facts, f] of PLANNED) {
      const start = addMonths(facts.analysisDate.slice(0, 7) as YearMonth, 1);
      const oldest = f.recoveryItems?.map((i) => i.pa).sort()[0];
      const from = `${oldest ?? addMonths(facts.referenceMonth, -11)}-01`;
      const to = lastDay(addMonths(start, 35));
      for (const id of refIdsOf(f)) {
        const p = LAW.get(id);
        if (p === undefined || p.kind === 'procedure') continue;
        const ok =
          (p.effectiveFrom == null || p.effectiveFrom <= to) &&
          (p.effectiveUntil == null || from <= p.effectiveUntil);
        expect(ok, `${name} ${f.ruleId} ${id}`).toBe(true);
      }
    }
  });

  it('every quoted menu label and every code with digits in `where` is in a source the step cites', () => {
    for (const rule of Object.keys(CATALOG) as RuleKey[]) {
      for (const t of CATALOG[rule].steps) {
        const path = t.where?.path;
        if (path === undefined) continue;
        const haystack = squash(t.refIds.map((id) => LAW.get(id)?.text ?? '').join('\n'));
        const quoted = [...path.matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
        const codes = [...path.matchAll(/[A-Z]-\d+/g)].map((m) => m[0]);
        for (const piece of [...quoted, ...codes])
          expect(haystack.includes(squash(piece)), `${t.id}: ${piece}`).toBe(true);
      }
    }
  });

  it('the steps never state the research 08 §11 items as facts', () => {
    const texts = FINDINGS.flatMap(([, , f]) => [
      ...f.actionPlan.map((s) => s.what),
      ...f.howToReceive.map((h) => h.summary),
    ]).join('\n');
    expect(texts).not.toMatch(/requalificad/i); // §11, item 13
    expect(texts).not.toMatch(/contrato de câmbio|invoice/i); // §11, item 8
    expect(texts).not.toMatch(/onze por cento|\b11%/); // §11, item 5
  });
});

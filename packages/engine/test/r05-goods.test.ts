// D54: R05 and R05-REC for the export of GOODS (Anexo I resale, Anexo II industry) carry their own qualification,
// PGDAS-D activity, DEFIS step, citations, "não faça" lines and tradeoffs; services (Anexos III–V) keep theirs.
// The amounts are the same arithmetic for both (LC 123, art. 18, § 14), already covered by the goldens.
import { describe, expect, it } from 'vitest';
import { actionRefOf, buildActionPlan } from '../src/actions/build.ts';
import { CATALOG } from '../src/actions/catalog.ts';
import { analyze } from '../src/analyze.ts';
import { resolveAssumptions } from '../src/assumptions.ts';
import { dasDueDate } from '../src/calendar.ts';
import { brl } from '../src/money.ts';
import { createCtx, currentProLabore } from '../src/projection.ts';
import { exportKindOf } from '../src/rules/r05.ts';
import { dasUnder, paInputs } from '../src/scenario.ts';
import type { Anexo, DasPayment, EngineResult, Facts, Finding } from '../src/types.ts';
import { constant, OBSERVED, syntheticFacts } from './golden/fixtures/facts.ts';
import { LAW } from './golden/fixtures/law-corpus.ts';

const SERVICES_ONLY = [
  'lc116-2003/art2',
  'lc214-2025/art80',
  'res-cgsn140-2018/art25/p4',
  'res-cgsn140-2018/art25/p4-a',
];

const run = (facts: Facts): EngineResult => {
  const r = analyze(facts);
  if (!r.ok) throw new Error(r.error.code);
  return r.value;
};
const find = (res: EngineResult, ruleId: string): Finding => {
  const f = res.findings.find((x) => x.ruleId === ruleId);
  if (f === undefined) throw new Error(`${ruleId} not found`);
  return f;
};

/** A company of the anexo exporting 50.000,00 a month, with the DAS paid unsegregated (so R05-REC measures). */
function exporter(anexo: Anexo, withDas = true): Facts {
  const f = syntheticFacts({
    export: constant(brl('50.000,00')),
    exportResultAbroad: true,
    subjectToFatorR: false,
  });
  f.companyDetails.value.baseAnexo = anexo;
  if (!withDas) return f;
  const ctx = createCtx(f, resolveAssumptions(f));
  const paid: DasPayment[] = OBSERVED.map((pa) => {
    const inputs = paInputs(ctx, pa, (m) => currentProLabore(ctx, m));
    return { pa, amount: dasUnder(ctx, pa, inputs, anexo, false).das, paymentDate: dasDueDate(pa) };
  });
  f.dasPaid = { value: paid, provenance: { origin: 'open_finance' } };
  return f;
}

const allRefs = (f: Finding) => [
  ...f.refs.map((r) => r.id),
  ...f.actionPlan.flatMap((s) => s.refIds),
  ...f.howToReceive.flatMap((h) => h.refIds),
];

describe('D54: what is exported, by anexo', () => {
  it('Anexos I and II export goods; III, IV and V export services', () => {
    expect(exportKindOf('I')).toBe('goods');
    expect(exportKindOf('II')).toBe('goods');
    for (const a of ['III', 'IV', 'V'] as const) expect(exportKindOf(a)).toBe('services');
  });
});

describe('D54: R05 for an Anexo I company exporting goods', () => {
  const res = run(exporter('I'));
  const r05 = find(res, 'R05');
  const rec = find(res, 'R05-REC');

  it('plan: goods test, PGDAS-D activity 2, DEFIS, documents, and the open question on proof', () => {
    expect(r05.actionPlan.map((s) => s.id)).toEqual([
      'R05.action.1',
      'R05.action.2',
      'R05.action.5',
      'R05.action.3',
      'R05.action.4',
    ]);
    const [qualify, declare, defis] = r05.actionPlan;
    expect(qualify?.what).toContain('exportação de mercadorias');
    expect(qualify?.what).toContain('comercial exportadora');
    expect(qualify?.refIds).toEqual(
      expect.arrayContaining(['manual-pgdas-d#1.5', 'lc123-2006/art18/p4-a', 'lc214-2025/art79']),
    );
    expect(declare?.where?.path).toContain('"2 - Revenda de mercadorias para o exterior"');
    expect(declare?.refIds).toContain('manual-pgdas-d#6.5-mercadorias');
    expect(declare?.from).toBe('2026-12');
    expect(declare?.until).toBe('2027-01-20');
    expect(defis?.where?.path).toBe('DEFIS › Acessar DEFIS');
    expect(defis?.refIds).toEqual(['manual-pgdas-d#9.2', 'manual-pgdas-d#9.4.3.1']);
  });

  it('cites no services provision, and every ref of the plan is in the corpus with its mirror', () => {
    for (const f of [r05, rec]) {
      for (const id of SERVICES_ONLY) expect(allRefs(f), `${f.ruleId} ${id}`).not.toContain(id);
      for (const s of f.actionPlan) {
        if (s.noSource === true) continue;
        expect(s.refIds.length, s.id).toBeGreaterThan(0);
        for (const id of s.refIds) {
          expect(LAW.get(id), id).toBeDefined();
          expect(actionRefOf(id)?.captureSha256, id).toBe(LAW.get(id)?.sourceSha256);
        }
      }
    }
    expect(r05.refs[0]?.id).toBe('lc123-2006/art18/p4-a');
  });

  it('"não faça", tradeoffs and assumptions speak of goods, never of services or ISS', () => {
    for (const f of [r05, rec]) {
      const texts = [...f.doNot, ...f.tradeoffs].join('\n');
      expect(texts).not.toMatch(/servi[çc]o|prefeitura|ISS dessa|LC 116/);
      expect(f.doNot.some((t) => t.includes('mercadorias para o exterior do país'))).toBe(true);
      expect(f.doNot).toContain('Não peça a restituição sem antes retificar o PGDAS-D.');
    }
    expect(r05.tradeoffs.join(' ')).toContain('exportação das mercadorias');
    expect(r05.assumptionsUsed.join('\n')).toContain('LC 214, art. 79');
    expect(r05.assumptionsUsed.join('\n')).not.toContain('LC 116');
  });

  it('R05-REC: goods test first, no ISS step, the ICMS step and the federal claim', () => {
    expect(rec.actionPlan[0]?.what).toContain('exportação de mercadorias');
    expect(rec.actionPlan[0]?.refIds).toEqual(
      expect.arrayContaining(['manual-pgdas-d#1.5', 'lc123-2006/art18/p4-a']),
    );
    const ids = rec.actionPlan.map((s) => s.id);
    expect(ids).toContain('R05-REC.action.6');
    expect(ids).toContain('R05-REC.action.9');
    expect(ids).not.toContain('R05-REC.action.7');
    expect(rec.byDestination?.municipal).toEqual([0, 0]);
  });
});

describe('D54: the goods plan for an Anexo II company (activity 4)', () => {
  it('declares in "4 - Venda de mercadorias industrializadas pelo contribuinte para o exterior"', () => {
    // R05 is still off for Anexo II (r05CoversAnexo, D52) until Enzo approves the golden change; the plan builder is
    // checked directly on an Anexo I finding with the company's anexo set to II.
    const r05 = find(run(exporter('I', false)), 'R05');
    const facts = exporter('II', false);
    const { actionPlan } = buildActionPlan(r05, { facts, start: '2026-12' });
    expect(actionPlan.map((s) => s.id)).toEqual([
      'R05.action.1',
      'R05.action.2',
      'R05.action.5',
      'R05.action.3',
      'R05.action.4',
    ]);
    expect(actionPlan[1]?.where?.path).toContain(
      '"4 - Venda de mercadorias industrializadas pelo contribuinte para o exterior"',
    );
    expect(actionPlan[1]?.what).toContain('industrializadas pela empresa');
  });
});

describe('D54: services keep their plan (Anexo III)', () => {
  it('R05: the services test and activity 9; no goods step', () => {
    const r05 = find(run(exporter('III', false)), 'R05');
    expect(r05.actionPlan.map((s) => s.id)).toEqual([
      'R05.action.1',
      'R05.action.2',
      'R05.action.3',
      'R05.action.4',
    ]);
    expect(r05.actionPlan[1]?.where?.path).toContain('"9 - Prestação de Serviços para o exterior"');
    expect(r05.actionPlan[0]?.refIds).toContain('lc116-2003/art2');
    expect(r05.doNot[0]).toContain('LC 116, art. 2º, parágrafo único');
  });

  it('each variant of a step id has exactly one of the export conditions', () => {
    for (const rule of ['R05', 'R05-REC'] as const) {
      const byId = new Map<string, string[][]>();
      for (const t of CATALOG[rule].steps)
        byId.set(t.id, [...(byId.get(t.id) ?? []), t.appliesIf ?? []]);
      for (const [id, variants] of byId) {
        if (variants.length < 2) continue;
        if (!variants.flat().some((c) => c.startsWith('export_'))) continue;
        for (const v of variants)
          expect(v.filter((c) => c.startsWith('export_')).length, id).toBe(1);
      }
    }
  });
});

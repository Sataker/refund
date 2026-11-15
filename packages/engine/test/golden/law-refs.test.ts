// CLAUDE.md rule 3 (engine review of E5): every citation the engine emits is a provision of @refund/law, in force in
// the step's month, or a captured non-law source (`type: 'procedure'`). The corpus is read from the law package's
// data files: a package dependency engine → law would form a cycle with law/test → engine (TESTS §1).
import { describe, expect, it } from 'vitest';
import dec12797 from '../../../law/articles/dec12797-2025.json' with { type: 'json' };
import dl1598 from '../../../law/articles/dl1598-1977.json' with { type: 'json' };
import lc116 from '../../../law/articles/lc116-2003.json' with { type: 'json' };
import lc118 from '../../../law/articles/lc118-2005.json' with { type: 'json' };
import lc123 from '../../../law/articles/lc123-2006.json' with { type: 'json' };
import lc214 from '../../../law/articles/lc214-2025.json' with { type: 'json' };
import lc238 from '../../../law/articles/lc238-2026.json' with { type: 'json' };
import lei810 from '../../../law/articles/lei810-1949.json' with { type: 'json' };
import lei5172 from '../../../law/articles/lei5172-1966.json' with { type: 'json' };
import lei8212 from '../../../law/articles/lei8212-1991.json' with { type: 'json' };
import lei9249 from '../../../law/articles/lei9249-1995.json' with { type: 'json' };
import lei9250 from '../../../law/articles/lei9250-1995.json' with { type: 'json' };
import lei9532 from '../../../law/articles/lei9532-1997.json' with { type: 'json' };
import lei10147 from '../../../law/articles/lei10147-2000.json' with { type: 'json' };
import lei10406 from '../../../law/articles/lei10406-2002.json' with { type: 'json' };
import lei10485 from '../../../law/articles/lei10485-2002.json' with { type: 'json' };
import lei10637 from '../../../law/articles/lei10637-2002.json' with { type: 'json' };
import lei10666 from '../../../law/articles/lei10666-2003.json' with { type: 'json' };
import lei10833 from '../../../law/articles/lei10833-2003.json' with { type: 'json' };
import lei11053 from '../../../law/articles/lei11053-2004.json' with { type: 'json' };
import lei15191 from '../../../law/articles/lei15191-2025.json' with { type: 'json' };
import lei15270 from '../../../law/articles/lei15270-2025.json' with { type: 'json' };
import port13 from '../../../law/articles/port-mps-mf13-2026.json' with { type: 'json' };
import res140 from '../../../law/articles/res-cgsn140-2018.json' with { type: 'json' };
import res190 from '../../../law/articles/res-cgsn190-2026.json' with { type: 'json' };
import { analyze } from '../../src/analyze.ts';
import { brl } from '../../src/money.ts';
import { ALL_PARAMETERS, legalRefOf } from '../../src/parameters/index.ts';
import { PROCEDURE_REFS } from '../../src/parameters/legal-refs.ts';
import { estimateByProfile } from '../../src/profile.ts';
import { RULE_REFS, type RuleId, refsOfRule, rulesByRef } from '../../src/ref-index.ts';
import { REFS } from '../../src/rules/refs.ts';
import { daysInMonth } from '../../src/time.ts';
import type { Cents, Facts, LegalRef, Step, YearMonth } from '../../src/types.ts';
import { constant, fact, heroFacts, syntheticFacts } from './fixtures/facts.ts';
import { HERO_PROFILE } from './fixtures/profile.ts';

interface Provision {
  id: string;
  label: string;
  url: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  sourceSha256: string;
}
const corpus = new Map<string, Provision>(
  (
    [
      dec12797,
      dl1598,
      lc116,
      lc118,
      lc123,
      lc214,
      lc238,
      lei5172,
      lei810,
      lei8212,
      lei9249,
      lei9250,
      lei9532,
      lei10147,
      lei10406,
      lei10485,
      lei10637,
      lei10666,
      lei10833,
      lei11053,
      lei15191,
      lei15270,
      port13,
      res140,
      res190,
    ] as Provision[][]
  )
    .flat()
    .map((p) => [p.id, p]),
);
const procedures = new Set<string>(Object.keys(PROCEDURE_REFS));

/** A provision is in force in a PA when its validity overlaps the month. */
function inForceIn(p: Provision, month: YearMonth): boolean {
  const first = `${month}-01`;
  const last = `${month}-${daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5)))}`;
  return (
    (p.effectiveFrom === null || p.effectiveFrom <= last) &&
    (p.effectiveUntil === null || first <= p.effectiveUntil)
  );
}

function checkRef(ref: LegalRef, month?: YearMonth): void {
  if (ref.type === 'procedure') {
    expect(procedures.has(ref.id), ref.id).toBe(true);
    expect(ref.captureSha256).toMatch(/^[0-9a-f]{64}$/);
    return;
  }
  const p = corpus.get(ref.id);
  expect(p, `${ref.id} is not in @refund/law`).toBeDefined();
  if (p === undefined) return;
  expect(ref.label).toBe(p.label);
  expect(ref.url).toBe(p.url);
  expect(ref.captureSha256).toBe(p.sourceSha256);
  if (month !== undefined) expect(inForceIn(p, month), `${ref.id} in ${month}`).toBe(true);
}

describe('legal references exist in @refund/law (CLAUDE.md rule 3)', () => {
  const r = analyze(heroFacts());
  if (!r.ok) throw new Error(r.error.code);
  const steps: Step[] = r.value.findings.flatMap((f) => f.trace);

  it('every step ref of every hero finding is a corpus provision in force in its month, or a procedure', () => {
    const withRef = steps.filter((s) => s.ref !== undefined);
    expect(withRef.length).toBeGreaterThan(30);
    for (const s of withRef) checkRef(s.ref as LegalRef, s.month);
  });

  it('every finding-level ref of the hero exists in the corpus', () => {
    for (const f of r.value.findings) for (const ref of f.refs) checkRef(ref);
  });

  it('every rule ref, every rulesByRef key and every parameter ref is valid', () => {
    for (const ref of Object.values(REFS)) checkRef(ref);
    for (const id of Object.keys(rulesByRef)) {
      expect(corpus.has(id) || procedures.has(id), id).toBe(true);
    }
    for (const e of ALL_PARAMETERS) {
      const ref = legalRefOf(e);
      if (ref !== undefined) checkRef(ref, e.effectiveFrom);
    }
  });

  it('the old provisional convention (<regulation>#<provision>) no longer appears in law refs', () => {
    for (const s of steps) if (s.ref?.type === 'regulation') expect(s.ref.id).not.toContain('#');
  });
});

// E8: the full cross-check (EXECUTION §9, E1/E8 row): every reference the engine can emit, not only the hero's.
// (TESTS §2.3 places INV-5 in packages/law/test; outside E8's scope, so it runs here against the corpus files.)
describe('every engine reference exists in the corpus (INV-5, all rules)', () => {
  it('RULE_REFS and refsOfRule (metadata + parameter refs) of every rule are valid', () => {
    for (const ruleId of Object.keys(RULE_REFS) as RuleId[]) {
      expect(RULE_REFS[ruleId].length, ruleId).toBeGreaterThan(0);
      for (const ref of refsOfRule(ruleId)) checkRef(ref);
    }
    // A parameter change reaches the rules that read it: the annual IR table feeds R01 and R04.
    expect(rulesByRef['rfb-tributacao-2026#tabela-anual']).toEqual(
      expect.arrayContaining(['R01', 'R04']),
    );
  });

  const scenarios: Record<string, Facts> = (() => {
    const pharmacy = syntheticFacts({
      domestic: constant(brl('50.000,00')),
      subjectToFatorR: false,
      baseAnexo: 'I',
      assumptions: {
        monofasicoPct: { value: '0.4', origin: 'user', editable: true, source: 'slider' },
      },
    });
    pharmacy.companyDetails.value.resellsMonofasico = true;
    const pharmacyNoPct = syntheticFacts({
      domestic: constant(brl('50.000,00')),
      subjectToFatorR: false,
      baseAnexo: 'I',
    });
    pharmacyNoPct.companyDetails.value.resellsMonofasico = true;
    const mei = syntheticFacts({ regime: 'MEI', domestic: constant(brl('8.100,00')) });
    const large = syntheticFacts({ domestic: constant(brl('250.000,00')), subjectToFatorR: false });
    const a02 = syntheticFacts({
      domestic: constant(brl('50.000,00')),
      proLabore: constant(0 as Cents),
      distributions: [
        {
          month: '2026-10',
          payerCnpj: 'RFTEST00000100',
          grossAmount: brl('20.000,00'),
          irrfWithheld: 0 as Cents,
          profitThrough2025Approved: false,
        },
      ],
    });
    const pgbl = syntheticFacts({
      domestic: constant(brl('60.000,00')),
      cltGross: constant(brl('15.000,00')),
      proLabore: constant(brl('3.000,00')),
      otherTaxableIncome: constant(brl('12.000,00')),
    });
    pgbl.personalExpensesInPj = fact([
      { transactionId: 't', month: '2026-05', amount: 5590 as Cents, merchant: 'NETFLIX' },
    ]);
    return { pharmacy, pharmacyNoPct, mei, large, a02, pgbl };
  })();

  for (const [name, facts] of Object.entries(scenarios)) {
    it(`${name}: every step ref is in force in its month and every finding ref exists`, () => {
      const res = analyze(facts);
      if (!res.ok) throw new Error(res.error.code);
      expect(res.value.findings.length).toBeGreaterThan(0);
      for (const f of res.value.findings) {
        for (const ref of f.refs) checkRef(ref);
        for (const s of f.trace) if (s.ref !== undefined) checkRef(s.ref, s.month);
      }
    });
  }

  it('the rules found across these scenarios cover R01–R06, R05-REC, R02, R03, A01 and A02', () => {
    const seen = new Set<string>();
    for (const facts of [heroFacts(), ...Object.values(scenarios)]) {
      const res = analyze(facts);
      if (res.ok) for (const f of res.value.findings) seen.add(f.ruleId);
    }
    expect([...seen].sort()).toEqual(
      ['A01', 'A02', 'R01', 'R02', 'R03', 'R04', 'R05', 'R05-REC', 'R06'].sort(),
    );
  });

  it('profile-based estimate: every applicable-rule ref and every assumption ref exists', () => {
    for (const answers of [
      {
        monthlyRevenueBracket: 'from_150k_to_300k',
        hasEmployees: 'yes',
        receivesFromAbroad: 'dont_know',
      },
      {
        monthlyRevenueBracket: 'dont_know',
        hasEmployees: 'yes',
        receivesFromAbroad: 'half_or_more',
      },
    ] as const) {
      for (const profile of [
        HERO_PROFILE,
        { ...HERO_PROFILE, primaryCnae: '4771-7/01' },
        { ...HERO_PROFILE, optedIntoMei: true },
      ]) {
        const r = estimateByProfile(profile, answers, { analysisDate: '2026-11-12' });
        if (!r.ok) throw new Error(r.error.code);
        for (const rule of r.value.rules) checkRef(rule.ref);
        for (const a of r.value.assumptions) if (a.ref !== undefined) checkRef(a.ref);
      }
    }
  });
});

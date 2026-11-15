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
import { analyze, rulesByRef } from '../../src/analyze.ts';
import { ALL_PARAMETERS, legalRefOf } from '../../src/parameters/index.ts';
import { PROCEDURE_REFS } from '../../src/parameters/legal-refs.ts';
import { REFS } from '../../src/rules/refs.ts';
import { daysInMonth } from '../../src/time.ts';
import type { LegalRef, Step, YearMonth } from '../../src/types.ts';
import { heroFacts } from './fixtures/facts.ts';

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
    for (const id of Object.keys(rulesByRef)) expect(corpus.has(id), id).toBe(true);
    for (const e of ALL_PARAMETERS) {
      const ref = legalRefOf(e);
      if (ref !== undefined) checkRef(ref, e.effectiveFrom);
    }
  });

  it('the old provisional convention (<regulation>#<provision>) no longer appears in law refs', () => {
    for (const s of steps) if (s.ref?.type === 'regulation') expect(s.ref.id).not.toContain('#');
  });
});

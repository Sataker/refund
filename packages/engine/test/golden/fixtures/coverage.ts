// ENGINE-SPEC C.11.10, T11-19: margin coverage. For CNAE 6201-5/01, every answer combination that yields a range is
// checked against a dense sweep of its own answer region (21 revenues × fractions stepping 5 p.p. × payrolls stepping
// 5% down from the boundary, plus "just below"): every dense total must be ≥ the displayed minimum. If this fails,
// stop and record it in EXECUTION §9; never touch the 0,85 margin to make it pass (CLAUDE.md, rule 11).
import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/analyze.ts';
import { D, reais, roundToCents } from '../../../src/money.ts';
import {
  cnaeAnexoRow,
  estimateByProfile,
  type GridPoint,
  syntheticFacts,
} from '../../../src/profile.ts';
import {
  type Cents,
  cents,
  type ProfileAnswers,
  type ProfileEstimate,
  type Rate,
  type RevenueBracket,
} from '../../../src/types.ts';
import { allAnswers, HERO_PROFILE } from './profile.ts';

const ANALYSIS_DATE = '2026-11-12' as const;
const SM = 162100;
const row = cnaeAnexoRow('6201-5/01');
if (row === undefined) throw new Error('6201-5/01 missing from cnae-anexo.json');

const LIMITS: Partial<Record<RevenueBracket, [number, number]>> = {
  from_15k_to_30k: [1500000, 3000000],
  from_30k_to_60k: [3000000, 6000000],
  from_60k_to_150k: [6000000, 15000000],
  from_150k_to_300k: [15000000, 30000000],
};
const FRACTION_LIMITS: Record<ProfileAnswers['receivesFromAbroad'], [number, number]> = {
  no: [0, 0],
  less_than_half: [0, 50],
  half_or_more: [50, 100],
  dont_know: [0, 100],
};

const steps = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
};

function densePayrolls(revenue: number, employees: ProfileAnswers['hasEmployees']): number[] {
  if (employees === 'no') return [0];
  const boundary = roundToCents(reais(cents(revenue)).times('0.28')) - SM;
  const out = steps(0, 100, 5).map((pct) =>
    roundToCents(reais(cents(boundary)).times(D(100 - pct).dividedBy(100))),
  );
  return [...out, boundary - 100];
}

const totals = new Map<string, Cents>();
function denseTotal(r: number, sPct: number, f: number): Cents {
  const s = (sPct === 100 ? '1' : sPct === 0 ? '0' : D(sPct).dividedBy(100).toFixed()) as Rate;
  const id = `R${r}-S${s}-F${f}`;
  const hit = totals.get(id);
  if (hit !== undefined) return hit;
  const point: GridPoint = {
    id,
    monthlyRevenue: cents(r),
    exportFraction: s,
    monthlyCltPayroll: cents(f),
  };
  const res = analyze(
    syntheticFacts(HERO_PROFILE, row as NonNullable<typeof row>, point, ANALYSIS_DATE),
  );
  if (!res.ok) throw new Error(`${id}: ${res.error.code}`);
  const total = res.value.total.annualRegimeSavings ?? cents(0);
  totals.set(id, total);
  return total;
}

/**
 * T11-19 for the given revenue brackets (one test file per group, so the sweeps run in parallel). `timeout` per sweep:
 * the dense 150 mil group needs more under v8 coverage instrumentation (~3× slower than a plain run).
 */
export function coverageSuite(brackets: readonly RevenueBracket[], timeout = 180_000): void {
  describe(`T11-19 — margin coverage of the profile-based estimate (6201-5/01): ${brackets.join(', ')}`, () => {
    const ranges: { answers: ProfileAnswers; e: Extract<ProfileEstimate, { type: 'range' }> }[] =
      [];
    for (const answers of allAnswers()) {
      if (!brackets.includes(answers.monthlyRevenueBracket)) continue;
      const r = estimateByProfile(HERO_PROFILE, answers, { analysisDate: ANALYSIS_DATE });
      if (!r.ok) throw new Error(r.error.code);
      if (r.value.type === 'range') ranges.push({ answers, e: r.value });
    }

    it('there are combinations with a range to check', () => {
      expect(ranges.length).toBeGreaterThan(0);
    });

    for (const { answers, e } of ranges) {
      const label = `${answers.monthlyRevenueBracket} / employees ${answers.hasEmployees} / abroad ${answers.receivesFromAbroad}`;
      it(`every dense total ≥ the displayed minimum: ${label}`, { timeout }, () => {
        const [lo, hi] = LIMITS[answers.monthlyRevenueBracket] as [number, number];
        const [sLo, sHi] = FRACTION_LIMITS[answers.receivesFromAbroad];
        let n = 0;
        let min = Number.POSITIVE_INFINITY;
        for (const r of steps(lo, hi, (hi - lo) / 20)) {
          for (const s of steps(sLo, sHi, 5)) {
            for (const f of densePayrolls(r, answers.hasEmployees)) {
              min = Math.min(min, denseTotal(r, s, f));
              n += 1;
            }
          }
        }
        expect(n).toBeGreaterThanOrEqual(21);
        expect(min, `dense minimum ${min} vs displayed ${e.total[0]}`).toBeGreaterThanOrEqual(
          e.total[0],
        );
      });
    }
  });
}

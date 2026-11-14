// ENGINE-SPEC C.6 invariants on the combined scenario (TESTS §2.3–2.4), with fast-check over plausible facts:
// INV-1 (Σ marginals == total), INV-2 (thresholds), INV-3 (safe non-negative money), INV-5 (internal order does not
// change the total), INV-6 (determinism), recovery and alerts outside the total, recalculate == analyze.
// numRuns: 200 locally, FC_NUM_RUNS (1000) in CI. The seed is printed on failure.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyze, recalculate } from '../../src/analyze.ts';
import { resolveAssumptions } from '../../src/assumptions.ts';
import { createCtx } from '../../src/projection.ts';
import { regimeCostModel, regimeCostOf } from '../../src/scenario.ts';
import type {
  Cents,
  DasPayment,
  Distribution,
  EngineResult,
  Facts,
  Series,
  YearMonth,
} from '../../src/types.ts';
import { OBSERVED, syntheticFacts } from '../golden/fixtures/facts.ts';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const numRuns = Math.max(20, Math.floor(Number(env?.FC_NUM_RUNS ?? 200) / 4));

const monthly = (max: number) =>
  fc
    .array(fc.integer({ min: 0, max }), { minLength: 12, maxLength: 12 })
    .map((values) => Object.fromEntries(OBSERVED.map((m, i) => [m, values[i] as Cents])) as Series);
const flat = (max: number) =>
  fc
    .integer({ min: 0, max })
    .map((v) => Object.fromEntries(OBSERVED.map((m) => [m, v as Cents])) as Series);

const factsArb = fc
  .record({
    domestic: fc.oneof(flat(15_000_000), monthly(15_000_000)),
    export: fc.oneof(fc.constant({} as Series), flat(15_000_000), monthly(15_000_000)),
    cltGross: fc.oneof(fc.constant({} as Series), flat(4_000_000)),
    proLabore: flat(1_500_000),
    subjectToFatorR: fc.boolean(),
    baseAnexo: fc.constantFrom<'I' | 'III' | 'V'>('I', 'III', 'V'),
    worksInCompany: fc.boolean(),
    exportResultAbroad: fc.boolean(),
    margin: fc.constantFrom('0', '0.01', '0.02'),
    paid: fc.array(fc.integer({ min: 0, max: 3_000_000 }), { maxLength: 12 }),
    distributions: fc.array(
      fc.record({
        month: fc.constantFrom(...OBSERVED),
        amount: fc.integer({ min: 0, max: 12_000_000 }),
      }),
      { maxLength: 3 },
    ),
    otherIncome: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 1_500_000 })),
  })
  .map((g): Facts => {
    const dasPaid: DasPayment[] = g.paid.map((amount, i) => ({
      pa: OBSERVED[i] as YearMonth,
      amount: amount as Cents,
      paymentDate: `${OBSERVED[i]}-20` as `${number}-${string}-${string}`,
    }));
    const distributions: Distribution[] = g.distributions.map((d) => ({
      month: d.month,
      payerCnpj: 'RFTEST00000100',
      grossAmount: d.amount as Cents,
      irrfWithheld: 0 as Cents,
      profitThrough2025Approved: false,
    }));
    const other = Object.fromEntries(OBSERVED.map((m) => [m, g.otherIncome as Cents])) as Series;
    return syntheticFacts({
      domestic: g.domestic,
      export: g.export,
      cltGross: g.cltGross,
      proLabore: g.proLabore,
      subjectToFatorR: g.subjectToFatorR,
      baseAnexo: g.subjectToFatorR ? 'III' : g.baseAnexo,
      worksInCompany: g.worksInCompany,
      exportResultAbroad: g.exportResultAbroad,
      dasPaid,
      distributions,
      otherTaxableIncome: other,
      assumptions: {
        fatorRMargin: { value: g.margin, origin: 'user', editable: true, source: 'slider' },
        selicAnnual: { value: '0.15', origin: 'default', editable: true, source: 'fixture' },
      },
    });
  });

const clone = (f: Facts): Facts => JSON.parse(JSON.stringify(f)) as Facts;

const ok = (f: Facts): EngineResult => {
  const r = analyze(f);
  if (!r.ok) throw new Error(`${r.error.code} ${JSON.stringify(r.error.detail)}`);
  return r.value;
};

describe('combined scenario invariants (C.6)', { timeout: 300_000 }, () => {
  it('INV-1 and INV-2: Σ marginals (countsInTotal) == total; counted findings pass their thresholds', () => {
    fc.assert(
      fc.property(factsArb, (f) => {
        const r = ok(f);
        const counted = r.findings.filter((x) => x.countsInTotal);
        expect(counted.reduce((a, x) => a + x.marginalValue12m, 0)).toBe(r.total.savings12m);
        expect(counted.reduce((a, x) => a + (x.annualRegimeValue ?? 0), 0)).toBe(
          r.total.annualRegimeSavings ?? 0,
        );
        for (const x of counted) {
          const threshold =
            x.ruleId === 'R01'
              ? (x.trace.find((s) => s.id === 'R01.REGIME_GAIN')?.inputs.threshold?.value as number)
              : 100;
          expect(x.annualRegimeValue ?? 0).toBeGreaterThanOrEqual(threshold);
        }
        const byConfidence = Object.values(r.total.byConfidence).reduce((a, b) => a + b, 0);
        expect(byConfidence).toBe(r.total.savings12m);
      }),
      { numRuns },
    );
  });

  it('INV-3 and TESTS §2.3/2.4: safe integer money, steady-state savings ≥ 0, recovery and alerts outside the total', () => {
    fc.assert(
      fc.property(factsArb, (f) => {
        const r = ok(f);
        expect(r.total.annualRegimeSavings ?? 0).toBeGreaterThanOrEqual(0);
        for (const x of r.findings) {
          expect(Number.isSafeInteger(x.marginalValue12m)).toBe(true);
          if (x.type !== 'savings') expect(x.countsInTotal).toBe(false);
          if (x.type === 'recovery') {
            expect(x.confidence).not.toBe('confirmed');
            const [lo, hi] = x.range as [Cents, Cents];
            expect(lo).toBeLessThanOrEqual(hi);
            expect(lo).toBeGreaterThanOrEqual(0);
          }
          if (x.confidence !== 'confirmed') expect(x.range).toBeDefined();
          for (const s of x.trace) {
            if (s.result.unit === 'cents') expect(Number.isSafeInteger(s.result.value)).toBe(true);
          }
        }
        if (r.total.recoveryRange !== null) {
          expect(r.findings.some((x) => x.type === 'recovery')).toBe(true);
        }
      }),
      { numRuns },
    );
  });

  it('INV-5: the order of the input arrays and series keys does not change the total', () => {
    fc.assert(
      fc.property(factsArb, (f) => {
        const shuffled: Facts = clone(f);
        shuffled.dasPaid.value = [...f.dasPaid.value].reverse();
        shuffled.partner.distributions.value = [...f.partner.distributions.value].reverse();
        const rev = (s: Series) => Object.fromEntries(Object.entries(s).reverse()) as Series;
        shuffled.revenueByMarket.domestic.value = rev(f.revenueByMarket.domestic.value);
        shuffled.cltPayroll.grossPay.value = rev(f.cltPayroll.grossPay.value);
        const a = ok(f);
        const b = ok(shuffled);
        expect(b.total).toEqual(a.total);
        expect(JSON.stringify(b.findings)).toBe(JSON.stringify(a.findings));
      }),
      { numRuns: Math.max(10, Math.floor(numRuns / 2)) },
    );
  });

  it('INV-6: analyze is deterministic (same inputsHash, same result byte for byte)', () => {
    fc.assert(
      fc.property(factsArb, (f) => {
        const a = JSON.stringify(ok(f));
        const b = JSON.stringify(ok(clone(f)));
        expect(b).toBe(a);
      }),
      { numRuns: Math.max(10, Math.floor(numRuns / 2)) },
    );
  });

  it('the optimizer cost model equals the reference steady-state cost (regimeCostOf)', () => {
    fc.assert(
      fc.property(
        factsArb,
        fc.integer({ min: 162_100, max: 2_000_000 }),
        fc.boolean(),
        (f, p, seg) => {
          const ctx = createCtx(f, resolveAssumptions(f));
          const base = { segregateExport: seg, segregateMonofasico: false, pgblContribution: {} };
          const fast = regimeCostModel(ctx, base)(p as Cents);
          expect(fast).toEqual(regimeCostOf(ctx, { ...base, proLabore: p as Cents }));
        },
      ),
      { numRuns },
    );
  });

  it('TESTS §2.4: recalculate() with assumptions equal to the defaults == analyze()', () => {
    fc.assert(
      fc.property(factsArb, (f) => {
        const base = { ...f, assumptions: { selicAnnual: f.assumptions.selicAnnual } } as Facts;
        const explicit = recalculate(base, {
          ...base.assumptions,
          start: { value: '2026-12', origin: 'default', editable: true, source: 'C.4' },
          fatorRMargin: { value: '0.01', origin: 'default', editable: true, source: 'D13' },
          dividendRefundMonth: {
            value: '2027-06',
            origin: 'default',
            editable: true,
            source: 'D.2',
          },
        });
        const plain = analyze(base);
        if (!explicit.ok || !plain.ok) throw new Error('analysis failed');
        expect(explicit.value.total).toEqual(plain.value.total);
        expect(JSON.stringify(explicit.value.findings)).toBe(JSON.stringify(plain.value.findings));
      }),
      { numRuns: Math.max(10, Math.floor(numRuns / 2)) },
    );
  });
});

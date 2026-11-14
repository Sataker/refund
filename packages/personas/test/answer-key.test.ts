import { describe, expect, it } from 'vitest';
import type { ClassificationLabel } from '../src/index.ts';
import { committedAnswerKey, committedData, type Row, rows, sumOf } from './helpers.ts';

// Independent transcription of ENGINE-SPEC F.2 (values in cents). Do not import it from src:
// this is the oracle the generator is checked against (CLAUDE.md, rule 11).
const MONTHS = [
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
] as const;
const F2 = {
  grossClt: [
    1_020_000, 2_210_000, 1_020_000, 1_020_000, 1_020_000, 1_020_000, 1_020_000, 1_190_000,
    1_020_000, 1_020_000, 1_020_000, 1_020_000,
  ],
  fgts: [
    81_600, 122_400, 136_000, 81_600, 81_600, 81_600, 81_600, 81_600, 95_200, 81_600, 81_600,
    81_600,
  ],
  sigma: {
    fx: 60_000_000,
    grossClt: 13_600_000,
    fgts: 1_088_000,
    grossProLabore: 1_945_200,
    das: 10_710_000,
    grossDistribution: 28_800_000,
    darf1841: 900_000,
  },
  fs12: 16_633_200,
  rbt12: 60_000_000,
} as const;

const data = committedData();
const key = committedAnswerKey();
const all = rows(data, key);
const byLabel = (label: ClassificationLabel, holder?: 'PF' | 'PJ'): Row[] =>
  all.filter((r) => r.key.label === label && (holder === undefined || r.holder === holder));
const inMonth = (list: Row[], m: string): Row[] => list.filter((r) => r.tx.date.startsWith(m));

// Monthly IR and INSS with the 2026 parameters of ENGINE-SPEC A.1/A.2, in exact integer
// arithmetic (cents × 10⁶), rounded half-up once at the end.
const U = 1_000_000;
const roundUnits = (units: number): number => Math.floor((units + U / 2) / U);
function inss(grossCents: number): number {
  const brackets = [
    [162_100, 75],
    [290_284, 90],
    [435_427, 120],
    [847_555, 140],
  ] as const;
  let units = 0;
  let floor = 0;
  for (const [ceiling, perMille] of brackets) {
    const slice = Math.min(grossCents, ceiling) - floor;
    if (slice > 0) units += slice * perMille * 1_000;
    floor = ceiling;
  }
  return roundUnits(units);
}
function irrf(grossCents: number, inssCents: number): number {
  const base = grossCents - Math.max(inssCents, 60_720);
  const table = [
    [242_880, 0, 0],
    [282_665, 75, 18_216],
    [375_105, 150, 39_416],
    [466_468, 225, 67_549],
  ] as const;
  const row = table.find(([limit]) => base <= limit) ?? [Number.POSITIVE_INFINITY, 275, 90_873];
  const tax = Math.max(0, roundUnits(base * row[1] * 1_000 - row[2] * U));
  const reduction =
    grossCents <= 500_000
      ? 31_289
      : grossCents <= 735_000
        ? roundUnits(97_862 * U - grossCents * 133_145)
        : 0;
  return Math.max(0, tax - Math.min(reduction, tax));
}

describe('answer key × ENGINE-SPEC F.2 (sums)', () => {
  it('every transaction has exactly one answer-key entry', () => {
    const txCount = data.items.flatMap((i) => i.accounts.flatMap((a) => a.transactions)).length;
    expect(key.transactions).toHaveLength(txCount);
    expect(new Set(key.transactions.map((t) => t.sourceId)).size).toBe(txCount);
    for (const r of all) {
      expect(r.key.amountCents).toBe(r.tx.amountCents);
      expect(r.key.holder).toBe(r.holder);
    }
  });

  it('FX: 12 credits of 50.000,00, Σ 600.000,00 = RBT12', () => {
    const fx = byLabel('export_revenue', 'PJ');
    expect(fx).toHaveLength(12);
    for (const m of MONTHS) expect(sumOf(inMonth(fx, m))).toBe(5_000_000);
    expect(sumOf(fx)).toBe(F2.sigma.fx);
    expect(key.expectedFacts.rbt12).toBe(F2.rbt12);
  });

  it('DAS: 12 × 8.925,00 for the previous PA, Σ 107.100,00', () => {
    const das = byLabel('das_simples', 'PJ');
    expect(das).toHaveLength(12);
    expect(-sumOf(das)).toBe(F2.sigma.das);
    expect(key.expectedFacts.dasPaid.map((d) => d.pa)).toEqual(['2025-10', ...MONTHS.slice(0, 11)]);
    for (const d of key.expectedFacts.dasPaid) expect(d.amount).toBe(892_500);
    expect(key.expectedFacts.pgdasInference.matchedPas).toBe(12);
  });

  it('FGTS paid per month as in F.2, Σ 10.880,00', () => {
    const fgts = byLabel('fgts', 'PJ');
    MONTHS.forEach((m, i) => {
      expect(-sumOf(inMonth(fgts, m))).toBe(F2.fgts[i]);
    });
    expect(-sumOf(fgts)).toBe(F2.sigma.fgts);
  });

  it('salaries: net 4.548,68 = 5.100 − INSS 515,51 − IRRF 35,81; gross payroll card = F.2 column', () => {
    expect(inss(510_000)).toBe(51_551);
    expect(irrf(510_000, 51_551)).toBe(3_581);
    const salary = byLabel('salary', 'PJ');
    const plain = salary.filter((r) => r.tx.description === 'PIX ENVIADO [pessoa]');
    expect(plain).toHaveLength(24);
    for (const r of plain) expect(r.tx.amountCents).toBe(-(510_000 - 51_551 - 3_581));

    const payrollCard = key.cardAnswers.find((c) => c.id === 'clt-payroll-gross');
    expect(payrollCard?.answer).toEqual(
      Object.fromEntries(MONTHS.map((m, i) => [m, F2.grossClt[i]])),
    );
    expect(Object.values(key.expectedFacts.cltPayroll.grossPay).reduce((s, v) => s + v, 0)).toBe(
      F2.sigma.grossClt,
    );
    // 13º in December and ⅓ vacation in December (A) and June (B): one payment each, as in F.2.
    expect(
      inMonth(salary, '2025-12').filter((r) => r.tx.description.endsWith('13 SALARIO')),
    ).toHaveLength(2);
    expect(
      salary.filter((r) => r.tx.description.endsWith('FERIAS')).map((r) => r.key.month),
    ).toEqual(['2025-12', '2026-06']);
  });

  it('net of the ⅓ vacation follows the documented convention (INSS and IRRF on 6.800 − salary)', () => {
    const inssTotal = inss(680_000);
    const irrfTotal = irrf(680_000, inssTotal);
    const net = 170_000 - (inssTotal - 51_551) - (irrfTotal - 3_581);
    const vacation = byLabel('salary', 'PJ').filter((r) => r.tx.description.endsWith('FERIAS'));
    for (const r of vacation) expect(r.tx.amountCents).toBe(-net);
  });

  it('pró-labore: 12 × net 1.442,69 (1.621 − 178,31); gross card 1.621,00; Σ gross 19.452,00', () => {
    const pl = byLabel('pro_labore', 'PJ');
    expect(pl).toHaveLength(12);
    for (const r of pl) expect(r.tx.amountCents).toBe(-(162_100 - 17_831));
    expect(irrf(162_100, 17_831)).toBe(0);
    expect(key.cardAnswers.find((c) => c.id === 'pro-labore-gross')?.answer).toBe(162_100);
    expect(Object.values(key.expectedFacts.partner.grossProLabore).reduce((s, v) => s + v, 0)).toBe(
      F2.sigma.grossProLabore,
    );
  });

  it('DCTFWeb: INSS 1.209,33 (2 × 515,51 + 178,31) + IRRF 71,62 every month', () => {
    const dctf = byLabel('dctfweb', 'PJ');
    expect(dctf).toHaveLength(12);
    for (const r of dctf) expect(r.tx.amountCents).toBe(-(2 * 51_551 + 17_831 + 2 * 3_581));
  });

  it('distributions: 11 × 18.000 + 81.000 net in jul; gross = net + DARF 1841 = 288.000,00', () => {
    const dist = byLabel('distribution', 'PJ');
    expect(dist).toHaveLength(12);
    for (const m of MONTHS) {
      expect(-sumOf(inMonth(dist, m))).toBe(m === '2026-07' ? 8_100_000 : 1_800_000);
    }
    const darf = byLabel('darf_irrf_dividends', 'PJ');
    expect(darf.map((r) => [r.key.month, r.tx.amountCents])).toEqual([['2026-08', -900_000]]);
    expect(-sumOf(darf)).toBe(F2.sigma.darf1841);
    expect(-sumOf(dist) - sumOf(darf)).toBe(F2.sigma.grossDistribution);
    const facts = key.expectedFacts.partner.distributions;
    expect(facts.reduce((s, d) => s + d.grossAmount, 0)).toBe(F2.sigma.grossDistribution);
    expect(facts.find((d) => d.month === '2026-07')?.irrfWithheld).toBe(900_000);
  });

  it('FS12 = 136.000 + 10.880 + 19.452 = 166.332,00; Fator R 27,72%', () => {
    expect(F2.sigma.grossClt + F2.sigma.fgts + F2.sigma.grossProLabore).toBe(F2.fs12);
    expect(key.expectedFacts.fs12).toBe(F2.fs12);
    expect(key.expectedFacts.fatorR).toBe('0.27722');
    expect(F2.fs12 * 100_000).toBe(27_722 * F2.rbt12);
    expect(key.expectedFacts.totals12m).toMatchObject({
      exportRevenue: F2.sigma.fx,
      grossCltPay: F2.sigma.grossClt,
      fgtsPaid: F2.sigma.fgts,
      grossProLabore: F2.sigma.grossProLabore,
      dasPaid: F2.sigma.das,
      grossDistributions: F2.sigma.grossDistribution,
      darf1841: F2.sigma.darf1841,
    });
  });

  it('personal PJ card: Netflix 55,90 every month and supermarket 812,40 in mar/2026', () => {
    const personal = byLabel('personal_in_pj', 'PJ');
    expect(personal.every((r) => r.subtype === 'CREDIT_CARD')).toBe(true);
    const netflix = personal.filter((r) => r.tx.mcc === '4899');
    expect(netflix.map((r) => r.key.month)).toEqual([...MONTHS]);
    for (const r of netflix) expect(r.tx.amountCents).toBe(-5_590);
    const market = personal.filter((r) => r.tx.mcc === '5411');
    expect(market.map((r) => [r.key.month, r.tx.amountCents])).toEqual([['2026-03', -81_240]]);
  });

  it('PF: health plan 650,00, psychologist 800,00, gym 129,90 per month; income < 600 mil', () => {
    const plan = byLabel('deductible_health', 'PF');
    expect(plan).toHaveLength(12);
    for (const r of plan) {
      expect(r.tx.amountCents).toBe(-65_000);
      expect(r.tx.counterparty?.cnae).toBe('6550-2/00');
    }
    const psy = byLabel('health_to_confirm', 'PF');
    expect(psy).toHaveLength(12);
    for (const r of psy) {
      expect(r.tx.amountCents).toBe(-80_000);
      expect(r.tx.counterparty?.document?.type).toBe('CPF');
      expect(r.key.category).toBe('deductible_health');
    }
    const gym = byLabel('non_deductible', 'PF');
    expect(gym).toHaveLength(12);
    for (const r of gym) {
      expect(r.tx.amountCents).toBe(-12_990);
      expect(r.tx.counterparty?.cnae).toBe('9313-1/00');
    }
    const income = all.filter((r) => r.holder === 'PF' && r.tx.amountCents > 0);
    expect(sumOf(income)).toBe(12 * 144_269 + 11 * 1_800_000 + 8_100_000);
    expect(key.expectedFacts.totals12m.pfTotalIncome).toBeLessThan(60_000_000);
  });

  it('same holder: every pró-labore and distribution has a PF credit with the PJ CNPJ as payer', () => {
    const pfIdentity = data.items.find((i) => i.holder === 'PF')?.identity;
    expect(key.sameHolderPairs).toHaveLength(24);
    const txById = new Map(all.map((r) => [r.tx.sourceId, r.tx]));
    for (const p of key.sameHolderPairs) {
      const pj = txById.get(p.pjTransactionId);
      const pf = txById.get(p.pfTransactionId);
      expect(pj?.amountCents).toBe(-p.amountCents);
      expect(pf?.amountCents).toBe(p.amountCents);
      expect(pf?.date).toBe(pj?.date);
      expect(pf?.counterparty?.document?.publicValue).toBe(data.company.cnpj);
      expect(pj?.counterparty?.document?.mask).toBe(pfIdentity?.document.mask);
    }
  });

  it('cards: every card referenced by a transaction exists and points back to it', () => {
    const cards = new Map(key.cardAnswers.map((c) => [c.id, c]));
    for (const t of key.transactions) {
      if (t.cardId === null) continue;
      expect(cards.get(t.cardId)?.transactionIds, t.cardId).toContain(t.sourceId);
    }
    expect(cards.get('export-qualification')?.answer).toBe(true);
    expect(cards.get('partner-works-in-company')?.answer).toBe(true);
    expect(cards.get('monthly-distribution')?.answer).toBe(true);
    expect(cards.get('full-bookkeeping')?.answer).toBe(true);
    expect(cards.get('psychologist-beneficiary')?.answer).toBe('holder');
  });
});

describe('answer key × ENGINE-SPEC F.4 (video numbers)', () => {
  it('findings add up to the total (C.6 invariant)', () => {
    const counted = key.expectedFindings.filter((f) => f.countsInTotal);
    expect(counted.map((f) => f.ruleId)).toEqual(['R01', 'R05']);
    expect(counted.reduce((s, f) => s + (f.marginalValue12m ?? 0), 0)).toBe(6_231_892);
    expect(counted.reduce((s, f) => s + (f.annualRegimeValue ?? 0), 0)).toBe(7_400_628);
    expect(key.expectedTotal).toEqual({ next12m: 6_231_892, annualRegime: 7_400_628 });
    // cost(S0) − cost(S4): 109.239,72 − 46.920,80 and 109.239,72 − 35.233,44
    expect(10_923_972 - 4_692_080).toBe(6_231_892);
    expect(10_923_972 - 3_523_344).toBe(7_400_628);
  });

  it('videoNumbers are exactly the testIds and cents of the E3 stage', () => {
    expect(key.videoNumbers).toEqual([
      { screen: 'analysis', testId: 'analysis/money-hero', cents: 6_231_892 },
      { screen: 'dashboard', testId: 'dashboard/money-hero', cents: 6_231_892 },
      { screen: 'dashboard', testId: 'dashboard/regime-total', cents: 7_400_628 },
      { screen: 'dashboard', testId: 'dashboard/recovery-min', cents: 3_978_768 },
      { screen: 'dashboard', testId: 'dashboard/recovery-max', cents: 19_893_840 },
      { screen: 'dashboard', testId: 'dashboard/alert-R02-cost', cents: 111_170 },
    ]);
    const rec = key.expectedFindings.find((f) => f.ruleId === 'R05-REC');
    expect(rec?.range).toEqual({ min: 12 * 331_564, max: 60 * 331_564 });
    expect(rec?.countsInTotal).toBe(false);
  });
});

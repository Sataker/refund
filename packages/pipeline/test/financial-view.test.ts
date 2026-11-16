// buildFinancialView (ARCHITECTURE §4.4 "Financial view"; ENGINE-SPEC E.9; EXECUTION E14b, PR 1).
// (a) the hero through runAnalysis with the answer-key answers gives ENGINE-SPEC E.9.3 to the cent;
// (b) fixtures with a bank fee, two DAS for one PA and a card charge repeated within 3 days;
// (c) seal properties: a seal only links to a finding in the input, never from an LLM or pending row, no "gera crédito";
// (d) every seal citation exists in @refund/law.
import type { Cents, Finding, YearMonth } from '@refund/engine';
import { article } from '@refund/law';
import { describe, expect, it } from 'vitest';
import { groupOf, SEAL_TABLE } from '../src/financial-view.ts';
import {
  buildFinancialView,
  type Classification,
  type FinancialView,
  type FinancialViewFinding,
  type FinancialViewInput,
  financialViewOfRun,
  type GroupLine,
  type HolderView,
  type NormalizedTransaction,
  ratioBps,
} from '../src/index.ts';
import { monthly, tx } from './build.ts';
import { heroAnswered, heroInput } from './helpers.ts';

// ---------- helpers ----------

const ref = (id: string) => {
  const p = article(id);
  if (p === undefined) throw new Error(`not in @refund/law: ${id}`);
  return { id: p.id, label: p.label, url: p.url, verifiedAt: '2026-11-12' as const };
};

function finding(
  ruleId: string,
  type: Finding['type'],
  extra: Partial<FinancialViewFinding> = {},
): FinancialViewFinding {
  return {
    ruleId,
    order:
      {
        R01: 1,
        R05: 2,
        R06: 3,
        'R05-REC': 4,
        'R06-REC': 5,
        R04: 6,
        R02: 7,
        R03: 8,
        A01: 9,
        A02: 10,
      }[ruleId] ?? 99,
    type,
    refs: [ref('lc123-2006/art18/p5-j')],
    countsInTotal: type === 'savings',
    marginalValue12m: (type === 'savings' ? 100_000 : 0) as Cents,
    ...extra,
  };
}

const classified = (
  t: NormalizedTransaction,
  category: Classification['category'],
  o: Partial<Classification> = {},
): Classification => ({
  transactionId: t.id,
  category,
  confidence: 0.95,
  origin: 'rule',
  reason: 'teste',
  status: 'applied',
  ...o,
});

function view(
  input: Partial<FinancialViewInput> & Pick<FinancialViewInput, 'transactions'>,
): FinancialView {
  const r = buildFinancialView({
    referenceMonth: '2026-10',
    regime: 'SIMPLES',
    classifications: [],
    findings: [],
    ...input,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const group = (h: HolderView | null, id: GroupLine['groupId']): GroupLine => {
  const g = h?.groups.find((x) => x.groupId === id);
  if (g === undefined) throw new Error(`group ${id} missing`);
  return g;
};
const kinds = (g: GroupLine) => g.seals.map((s) => s.kind);

// ---------- (a) the hero: ENGINE-SPEC E.9.3 ----------

const hero = await heroAnswered();
const heroRun = heroInput();
const heroViewResult = financialViewOfRun(
  { ...heroRun, transactions: heroRun.transactions as never },
  hero.result,
);
if (!heroViewResult.ok) throw new Error(heroViewResult.error.message);
const heroView = heroViewResult.value;
const heroFindings = hero.result.engineResult?.findings ?? [];
const r02 = heroFindings.find((f) => f.ruleId === 'R02');
const r02HasIrpfRefund = (r02?.howToReceive ?? []).some((h) => h.method === 'irpf_refund');
const a01Fires = heroFindings.some((f) => f.ruleId === 'A01');

describe('E.9.3 hero: Marina’s financial view (174 transactions, nov/2025–out/2026)', () => {
  const pj = heroView.pj as HolderView;
  const pf = heroView.pf as HolderView;

  it('12 months, cash basis, reference out/2026', () => {
    expect(heroView.referenceMonth).toBe('2026-10');
    expect(heroView.months).toHaveLength(12);
    expect(heroView.months[0]).toBe('2025-11');
    expect(heroView.basis).toBe('cash');
  });

  it('PJ: Entrou R$ 600.000,00 · Saiu R$ 560.046,54', () => {
    expect(pj.inflow12m).toBe(60_000_000);
    expect(pj.outflow12m).toBe(56_004_654);
  });

  it('PJ groups: total, count and share (half-up basis points)', () => {
    const rows = pj.groups.map((g) => [g.groupId, g.direction, g.total12m, g.count, g.shareBps]);
    expect(rows).toEqual([
      ['export_revenue', 'inflow', 60_000_000, 12, 10_000],
      ['distributions', 'outflow', 27_900_000, 12, 4982],
      ['salaries', 'outflow', 11_989_966, 28, 2141],
      ['das', 'outflow', 10_710_000, 12, 1912],
      ['pro_labore', 'outflow', 1_731_228, 12, 309],
      ['payroll_taxes', 'outflow', 1_537_140, 12, 274],
      ['fgts', 'outflow', 1_088_000, 12, 194],
      ['dividend_irrf', 'outflow', 900_000, 1, 161],
      ['personal_in_pj', 'outflow', 148_320, 13, 26],
    ]);
    // Σ groups == tile, per direction (A10's invariant).
    const sum = (d: 'inflow' | 'outflow') =>
      pj.groups.filter((g) => g.direction === d).reduce((a, g) => a + g.total12m, 0);
    expect(sum('inflow')).toBe(pj.inflow12m);
    expect(sum('outflow')).toBe(pj.outflow12m);
  });

  it('PJ seals: R05 on the export revenue, R05-REC + R01/R05 on the DAS, R01 on the pró-labore, R02 on distributions', () => {
    expect(group(pj, 'export_revenue').seals).toMatchObject([
      { kind: 'lower_tax', ruleIds: ['R05'] },
    ]);
    expect(group(pj, 'das').seals).toMatchObject([
      { kind: 'money_to_receive', ruleIds: ['R05-REC'] },
      { kind: 'lower_tax', ruleIds: ['R01', 'R05'] },
    ]);
    expect(group(pj, 'pro_labore').seals).toMatchObject([{ kind: 'lower_tax', ruleIds: ['R01'] }]);
    expect(group(pj, 'distributions').seals).toMatchObject([
      { kind: 'attention', ruleIds: ['R02'] },
    ]);
    for (const id of ['salaries', 'payroll_taxes', 'fgts'] as const)
      expect(group(pj, id).seals).toEqual([]);
  });

  it('every seal cites refs[0] of its first finding by order', () => {
    for (const g of pj.groups) {
      for (const s of g.seals) {
        const first = heroFindings.find((f) => f.ruleId === s.ruleIds[0]);
        expect(s.ref).toEqual(first?.refs[0]);
      }
    }
  });

  it('DARF 1841 follows R02’s "como receber" (D29): irpf_refund → money_to_receive, otherwise atenção', () => {
    expect(kinds(group(pj, 'dividend_irrf'))).toEqual([
      r02HasIrpfRefund ? 'money_to_receive' : 'attention',
    ]);
  });

  // The two seals of E.9.3 that wait for an upstream stage (EXECUTION §9, 16/11): they turn on by themselves.
  it.skipIf(!r02HasIrpfRefund)(
    'E.9.3: DARF 1841 shows "tem dinheiro a receber" (needs E8b’s R02 irpf_refund)',
    () => {
      expect(group(pj, 'dividend_irrf').seals).toMatchObject([
        { kind: 'money_to_receive', ruleIds: ['R02'] },
      ]);
    },
  );
  it.skipIf(!a01Fires)(
    'E.9.3: "Gastos pessoais pagos pela empresa" shows "é risco" (needs the A01 fact)',
    () => {
      expect(group(pj, 'personal_in_pj').seals).toMatchObject([{ kind: 'risk', ruleIds: ['A01'] }]);
    },
  );
  it('without an A01 finding the personal group carries no seal (never one without its finding)', () => {
    expect(kinds(group(pj, 'personal_in_pj'))).toEqual(a01Fires ? ['risk'] : []);
  });

  it('PF: Entrou R$ 296.312,28 (all "Entre você e a empresa") · Saiu R$ 18.958,80', () => {
    expect(pf.inflow12m).toBe(29_631_228);
    expect(pf.outflow12m).toBe(1_895_880);
    expect(pf.groups.map((g) => [g.groupId, g.direction, g.total12m, g.count, g.shareBps])).toEqual(
      [
        ['holder_transfer', 'inflow', 29_631_228, 24, 10_000],
        ['health', 'outflow', 1_740_000, 24, 9178],
        ['personal', 'outflow', 155_880, 12, 822],
      ],
    );
  });

  it('PF health is "é dedutível" under Lei 9.250, art. 8º, II, with no finding and no R$ (R04 does not fire)', () => {
    expect(group(pf, 'health').seals).toEqual([
      {
        kind: 'deductible',
        ruleIds: [],
        ref: expect.objectContaining({ id: 'lei9250-1995/art8/ii' }),
      },
    ]);
    expect(group(pf, 'personal').seals).toEqual([]);
    expect(group(pf, 'holder_transfer').seals).toEqual([]);
  });

  it('O que mudou: the driver’s delta, never the total delta (note 3: +62.319,01 sits 9 cents from 62.318,92)', () => {
    expect(pj.highlights).toEqual([
      {
        month: '2026-07',
        deltaCents: 6_231_901,
        driver: { groupId: 'distributions', deltaCents: 6_300_000 },
      },
      {
        month: '2025-12',
        deltaCents: 1_032_235,
        driver: { groupId: 'salaries', deltaCents: 991_435 },
      },
      { month: '2026-06', deltaCents: 81_699, driver: { groupId: 'salaries', deltaCents: 81_699 } },
    ]);
    expect(pj.highlights[0]?.deltaCents).not.toBe(hero.result.engineResult?.total.savings12m);
    expect(pf.highlights).toEqual([]);
  });

  it('last month: out/2026 R$ 39.617,90, the same as set/2026; PF R$ 1.579,90 every month', () => {
    expect(pj.outflowChange).toEqual({
      month: '2026-10',
      cents: 3_961_790,
      previousMonth: '2026-09',
      previousCents: 3_961_790,
      deltaCents: 0,
    });
    expect(new Set(pf.monthly.map((m) => m.outflow))).toEqual(new Set([157_990]));
  });

  it('Maiores saídas (series collapsed by group + amount)', () => {
    expect(
      pj.biggestOutflows.map((r) => [
        r.groupId,
        r.amount,
        r.occurrences,
        r.total,
        r.occurrences === 1 ? r.lastDate : null,
      ]),
    ).toEqual([
      ['distributions', 8_100_000, 1, 8_100_000, '2026-07-10'],
      ['distributions', 1_800_000, 11, 19_800_000, null],
      ['dividend_irrf', 900_000, 1, 900_000, '2026-08-20'],
      ['das', 892_500, 12, 10_710_000, null],
      ['salaries', 454_868, 26, 11_826_568, null],
    ]);
  });

  it('Assinaturas e recorrentes: NETFLIX.COM in the PJ; health plan, psychologist and gym in the PF', () => {
    expect(pj.recurring.map((r) => [r.label, r.amount, r.occurrences, r.groupId])).toEqual([
      ['NETFLIX.COM', 5590, 12, 'personal_in_pj'],
    ]);
    expect(pf.recurring.map((r) => [r.amount, r.occurrences, r.groupId])).toEqual([
      [80_000, 12, 'health'],
      [65_000, 12, 'health'],
      [12_990, 12, 'personal'],
    ]);
    // A CPF counterparty is shown only by its mask.
    expect(pf.recurring[0]?.label).toMatch(/^Pessoa física · \*\*\*\.\d{3}\.\d{3}-\*\*$/);
  });

  it('Tarifas: none; Duplicidade: none (Q7: the persona stays as it is)', () => {
    for (const h of [pj, pf]) {
      expect(h.fees).toEqual({ total12m: 0, rows: [] });
      expect(h.duplicates).toEqual([]);
    }
  });

  it('nothing pending and no LLM row after the canonical answers', () => {
    for (const g of [...pj.groups, ...pf.groups]) {
      expect(g.pending).toBe(0);
      expect(g.byOrigin.llm).toBe(0);
    }
  });
});

// ---------- (b) detectors on fixtures ----------

describe('detectors', () => {
  it('a bank fee is a fee row with no seal (research 09, G21)', () => {
    const fees = monthly(3, '2026-10', {
      method: 'FEE',
      description: 'TARIFA PACOTE',
      amountCents: 4590,
    });
    const v = view({
      transactions: fees,
      classifications: fees.map((t) => classified(t, 'bank_fee', { ruleId: 'bank_fee' })),
      findings: [finding('R01', 'savings'), finding('A01', 'risk')],
    });
    const pj = v.pj as HolderView;
    expect(pj.fees.total12m).toBe(13_770);
    expect(pj.fees.rows).toMatchObject([
      { groupId: 'bank_fees', amount: 4590, occurrences: 3, total: 13_770 },
    ]);
    expect(group(pj, 'bank_fees').seals).toEqual([]);
    expect(pj.recurring).toMatchObject([{ groupId: 'bank_fees', occurrences: 3 }]);
  });

  it('two DAS for the same PA: same_guide_same_period, linked to the open das:<PA> card, no money seal', () => {
    const a = tx({
      description: 'PAGAMENTO DAS SIMPLES NACIONAL PA 05/2026',
      date: '2026-06-19',
      amountCents: 892_500,
      method: 'BOLETO',
    });
    const b = tx({
      description: 'PAGAMENTO DAS SIMPLES NACIONAL PA 05/2026',
      date: '2026-06-24',
      amountCents: 892_500,
      method: 'BOLETO',
    });
    const v = view({
      transactions: [a, b],
      classifications: [a, b].map((t) =>
        classified(t, 'das_tax', { ruleId: 'das_simples', status: 'pending_confirmation' }),
      ),
      openQuestionIds: ['das:2026-05'],
    });
    const pj = v.pj as HolderView;
    expect(pj.duplicates).toEqual([
      {
        reason: 'same_guide_same_period',
        groupId: 'das',
        amount: 892_500,
        dates: ['2026-06-19', '2026-06-24'],
        transactionIds: [a.id, b.id],
        questionId: 'das:2026-05',
      },
    ]);
    // Pending rows give no seal, and a duplicate has no money seal of its own (Q6).
    expect(group(pj, 'das').seals).toEqual([]);
    expect(group(pj, 'das').pending).toBe(2);
  });

  it('a guide without a PA in the description is never a duplicate; no open card → no questionId', () => {
    const a = tx({
      description: 'PAGAMENTO DAS PA 05/2026',
      date: '2026-06-19',
      amountCents: 100,
      method: 'BOLETO',
    });
    const b = tx({
      description: 'PAGAMENTO DAS PA 05/2026',
      date: '2026-06-29',
      amountCents: 100,
      method: 'BOLETO',
    });
    const c = tx({
      description: 'PAGAMENTO DAS',
      date: '2026-07-20',
      amountCents: 100,
      method: 'BOLETO',
    });
    const v = view({
      transactions: [a, b, c],
      classifications: [a, b, c].map((t) => classified(t, 'das_tax', { ruleId: 'das_simples' })),
    });
    const [only] = (v.pj as HolderView).duplicates;
    expect((v.pj as HolderView).duplicates).toHaveLength(1);
    expect(only?.transactionIds).toEqual([a.id, b.id]);
    expect(only).not.toHaveProperty('questionId');
  });

  it('a card charge repeated within 3 days: same_charge_within_3_days; 4 days apart is not', () => {
    const p = {
      method: 'CARD' as const,
      description: 'LOJA NUVEM SOFTWARE',
      name: 'LOJA NUVEM',
      amountCents: 19_900,
    };
    const a = tx({ ...p, date: '2026-09-02' });
    const b = tx({ ...p, date: '2026-09-05' });
    const c = tx({ ...p, date: '2026-10-01' });
    const d = tx({ ...p, date: '2026-10-05' });
    const all = [a, b, c, d];
    const v = view({
      transactions: all,
      classifications: all.map((t) => classified(t, 'operating_expense')),
    });
    expect((v.pj as HolderView).duplicates).toEqual([
      {
        reason: 'same_charge_within_3_days',
        groupId: 'operating_expense',
        amount: 19_900,
        dates: ['2026-09-02', '2026-09-05'],
        transactionIds: [a.id, b.id],
      },
    ]);
  });

  it('transfers between own accounts are never duplicates', () => {
    const a = tx({ date: '2026-09-02', amountCents: 50_000, description: 'TRANSF CONTA PROPRIA' });
    const b = tx({ date: '2026-09-03', amountCents: 50_000, description: 'TRANSF CONTA PROPRIA' });
    const v = view({
      transactions: [a, b],
      classifications: [a, b].map((t) =>
        classified(t, 'same_holder_transfer', { ruleId: 'own_account' }),
      ),
    });
    expect((v.pj as HolderView).duplicates).toEqual([]);
    expect(group(v.pj, 'internal_transfer').count).toBe(2);
  });

  it('recurring: ≥ 3 of the last 4 months within ±2%; taxes and payroll are excluded', () => {
    const saas = monthly(4, '2026-10', {
      method: 'CARD',
      description: 'SAAS FERRAMENTA',
      name: 'SAAS',
      amountCents: 10_000,
    });
    (saas[1] as NormalizedTransaction).amountCents = 10_150; // +1,5%: same cluster
    const twice = monthly(2, '2026-10', {
      method: 'CARD',
      description: 'EVENTO',
      name: 'EVENTO',
      amountCents: 5000,
    });
    const das = monthly(4, '2026-10', {
      method: 'BOLETO',
      description: 'DAS',
      amountCents: 892_500,
    });
    const v = view({
      transactions: [...saas, ...twice, ...das],
      classifications: [
        ...[...saas, ...twice].map((t) => classified(t, 'operating_expense')),
        ...das.map((t) => classified(t, 'das_tax', { ruleId: 'das_simples' })),
      ],
    });
    const rec = (v.pj as HolderView).recurring;
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({
      groupId: 'operating_expense',
      occurrences: 4,
      total: 40_150,
      amount: 10_000,
    });
    expect(rec[0]?.firstDate).toBe('2026-07-07');
  });

  it('month-over-month: delta and deltaBps against the month before (null when it was zero)', () => {
    const a = tx({ date: '2026-09-10', amountCents: 20_000 });
    const b = tx({ date: '2026-10-10', amountCents: 30_000 });
    const c = tx({ date: '2026-10-11', amountCents: 7_000, description: 'OUTRA' });
    const v = view({
      transactions: [a, b, c],
      classifications: [
        classified(a, 'operating_expense'),
        classified(b, 'operating_expense'),
        classified(c, 'salary'),
      ],
    });
    const op = group(v.pj, 'operating_expense');
    expect([op.lastMonth, op.previousMonth, op.deltaCents, op.deltaBps]).toEqual([
      30_000, 20_000, 10_000, 5000,
    ]);
    expect(group(v.pj, 'salaries').deltaBps).toBeNull();
    expect((v.pj as HolderView).outflowChange.deltaCents).toBe(17_000);
    // Sep rises from zero (+200,00), Oct +170,00 driven by the expense's +100,00; ordered by the holder delta.
    expect((v.pj as HolderView).highlights).toEqual([
      {
        month: '2026-09',
        deltaCents: 20_000,
        driver: { groupId: 'operating_expense', deltaCents: 20_000 },
      },
      {
        month: '2026-10',
        deltaCents: 17_000,
        driver: { groupId: 'operating_expense', deltaCents: 10_000 },
      },
    ]);
  });

  it('transactions outside the 12 months are left out; a holder with no transaction is null', () => {
    const old = tx({ date: '2025-10-31', amountCents: 999 });
    const inside = tx({ date: '2025-11-01', amountCents: 1 });
    const v = view({
      transactions: [old, inside],
      classifications: [
        classified(old, 'operating_expense'),
        classified(inside, 'operating_expense'),
      ],
    });
    expect((v.pj as HolderView).outflow12m).toBe(1);
    expect(v.pf).toBeNull();
  });

  it('labels: CNPJ → name, CPF → mask only, other methods → redacted description', () => {
    const cnpj = tx({
      cnpj: 'RFFORN01000100',
      name: 'FORNECEDOR LTDA',
      amountCents: 900_000,
      date: '2026-10-01',
    });
    const cpf = tx({
      cpf: '***.123.456-**',
      name: 'FULANO DE TAL',
      amountCents: 800_000,
      date: '2026-10-02',
    });
    const boleto = tx({
      method: 'BOLETO',
      description: 'BOLETO 12345678901234 CONDOMINIO',
      amountCents: 700_000,
      date: '2026-10-03',
    });
    const v = view({
      transactions: [cnpj, cpf, boleto],
      classifications: [cnpj, cpf, boleto].map((t) => classified(t, 'operating_expense')),
    });
    const labels = (v.pj as HolderView).biggestOutflows.map((r) => r.label);
    expect(labels[0]).toBe('FORNECEDOR LTDA');
    expect(labels[1]).toBe('Pessoa física · ***.123.456-**');
    expect(labels[2]).not.toMatch(/\d{6,}/);
    expect(labels.join(' ')).not.toContain('FULANO');
  });
});

// ---------- groups ----------

describe('group table (ARCHITECTURE §4.4)', () => {
  const c = (category: Classification['category'], o: Partial<Classification> = {}) =>
    groupOf({
      transactionId: 'x',
      category,
      confidence: 1,
      origin: 'rule',
      reason: '',
      status: 'applied',
      ...o,
    });

  it.each([
    ['darf_tax', 'darf_irrf_dividends', 'dividend_irrf'],
    ['darf_tax', 'darf_irrf_employment', 'payroll_taxes'],
    ['darf_tax', 'dctfweb', 'payroll_taxes'],
    ['darf_tax', 'carne_leao', 'carne_leao'],
    ['darf_tax', undefined, 'other_taxes'],
    ['inss_charge', 'gps_inss', 'payroll_taxes'],
    ['unclassified', 'non_deductible', 'personal'],
    ['unclassified', 'loan_received', 'loans'],
    ['unclassified', 'reversal_credit', 'reversal'],
    ['same_holder_transfer', 'partner_contribution', 'partner_contribution'],
    ['same_holder_transfer', 'own_account', 'internal_transfer'],
    ['same_holder_transfer', 'jcp', 'holder_transfer'],
    ['service_revenue', 'reversal_credit', 'service_revenue'], // the user said the refund credit was revenue
    ['bank_fee', 'bank_fee', 'bank_fees'],
  ] as const)('%s:%s → %s', (category, label, expected) => {
    expect(c(category, label === undefined ? {} : { ruleId: label })).toBe(expected);
  });

  it('LLM rows have no label and fall into their Category’s group; unclassified status → Sem categoria', () => {
    expect(c('darf_tax', { origin: 'llm', ruleId: 'darf_irrf_dividends' })).toBe('other_taxes');
    expect(c('operating_expense', { status: 'unclassified' })).toBe('unclassified');
    expect(c('unclassified', { status: 'rejected', origin: 'user' })).toBe('unclassified');
    expect(groupOf(undefined)).toBe('unclassified');
  });
});

// ---------- (c) seal properties ----------

describe('seal table (ENGINE-SPEC E.9.2)', () => {
  function sealsFor(
    category: Classification['category'],
    findings: FinancialViewFinding[],
    o: Partial<Classification> = {},
    holder: 'PF' | 'PJ' = 'PJ',
    direction: 'inflow' | 'outflow' = 'outflow',
  ) {
    const t = tx({ holder, direction, date: '2026-10-05' });
    const v = view({ transactions: [t], classifications: [classified(t, category, o)], findings });
    const h = holder === 'PJ' ? v.pj : v.pf;
    return h?.groups[0]?.seals ?? [];
  }

  it('A02 → "é risco" on pró-labore and on "Entre você e a empresa"', () => {
    expect(
      sealsFor('pro_labore', [finding('A02', 'risk')], { origin: 'user', status: 'confirmed' }),
    ).toMatchObject([{ kind: 'risk', ruleIds: ['A02'] }]);
    expect(
      sealsFor('same_holder_transfer', [finding('A02', 'risk')], { ruleId: 'same_holder' }),
    ).toMatchObject([{ kind: 'risk' }]);
  });

  it('R03 → "atenção" on revenue; R06 → "pode pagar menos" on sales and on the DAS; R06-REC → money on the DAS', () => {
    expect(
      sealsFor('service_revenue', [finding('R03', 'alert')], {}, 'PJ', 'inflow'),
    ).toMatchObject([{ kind: 'attention', ruleIds: ['R03'] }]);
    expect(
      sealsFor(
        'sales_revenue',
        [finding('R06', 'savings'), finding('R03', 'alert')],
        {},
        'PJ',
        'inflow',
      ).map((s) => s.kind),
    ).toEqual(['lower_tax', 'attention']);
    expect(
      sealsFor('das_tax', [finding('R06', 'savings'), finding('R06-REC', 'recovery')], {
        ruleId: 'das_simples',
      }).map((s) => s.kind),
    ).toEqual(['money_to_receive', 'lower_tax']);
  });

  it('a savings finding outside the total does not seal "pode pagar menos"', () => {
    expect(
      sealsFor('pro_labore', [finding('R01', 'savings', { countsInTotal: false })], {
        origin: 'user',
        status: 'confirmed',
      }),
    ).toEqual([]);
  });

  it('R04 seals health and pension only with marginalValue12m > 0', () => {
    const health = { ruleId: 'deductible_health' } as const;
    expect(
      sealsFor('deductible_health', [finding('R04', 'savings')], health, 'PF').map((s) => s.kind),
    ).toEqual(['lower_tax', 'deductible']);
    expect(
      sealsFor(
        'deductible_health',
        [finding('R04', 'savings', { marginalValue12m: 0 as Cents })],
        health,
        'PF',
      ).map((s) => s.kind),
    ).toEqual(['deductible']);
  });

  it('é dedutível: health_to_confirm only once answered "sim"; education by its label; PGBL only confirmed', () => {
    expect(
      sealsFor(
        'deductible_health',
        [],
        { ruleId: 'health_to_confirm', status: 'pending_confirmation' },
        'PF',
      ),
    ).toEqual([]);
    expect(
      sealsFor(
        'deductible_health',
        [],
        { ruleId: 'health_to_confirm', status: 'confirmed', origin: 'user' },
        'PF',
      ),
    ).toMatchObject([{ kind: 'deductible', ruleIds: [], ref: { id: 'lei9250-1995/art8/ii' } }]);
    expect(
      sealsFor('deductible_education', [], { ruleId: 'deductible_education' }, 'PF'),
    ).toMatchObject([{ kind: 'deductible', ref: { id: 'lei9250-1995/art8/ii' } }]);
    expect(
      sealsFor('pgbl_pension', [], { ruleId: 'pgbl', status: 'pending_confirmation' }, 'PF'),
    ).toEqual([]);
    expect(
      sealsFor('pgbl_pension', [], { ruleId: 'pgbl', status: 'confirmed', origin: 'user' }, 'PF'),
    ).toMatchObject([{ kind: 'deductible', ref: { id: 'lei9532-1997/art11' } }]);
  });

  it('no citation in force for the month → no deductible seal (never a made-up ref)', () => {
    const t = tx({ holder: 'PF', date: '1999-10-05' });
    const r = buildFinancialView({
      referenceMonth: '1999-10',
      regime: 'SIMPLES',
      transactions: [t],
      classifications: [classified(t, 'deductible_health', { ruleId: 'deductible_health' })],
      findings: [],
    });
    expect(r.ok && r.value.pf?.groups[0]?.seals).toEqual([]);
  });

  it('a finding with no refs gives no seal', () => {
    expect(
      sealsFor('pro_labore', [finding('R01', 'savings', { refs: [] })], {
        origin: 'user',
        status: 'confirmed',
      }),
    ).toEqual([]);
  });

  it('the table has no generates_credit row (D27)', () => {
    expect(SEAL_TABLE.some((r) => r.kind === 'generates_credit')).toBe(false);
  });

  // Deterministic sweep (seeded): every category × status × origin × regime × finding subset.
  const CATEGORIES: Classification['category'][] = [
    'export_revenue',
    'service_revenue',
    'sales_revenue',
    'das_tax',
    'darf_tax',
    'pro_labore',
    'profit_distribution',
    'same_holder_transfer',
    'personal_expense_in_pj',
    'deductible_health',
    'deductible_education',
    'pgbl_pension',
    'operating_expense',
    'bank_fee',
  ];
  const LABELS: Partial<Record<Classification['category'], string>> = {
    darf_tax: 'darf_irrf_dividends',
    deductible_health: 'health_to_confirm',
    deductible_education: 'deductible_education',
    pgbl_pension: 'pgbl',
  };
  const STATUSES: Classification['status'][] = [
    'applied',
    'pending_confirmation',
    'confirmed',
    'rejected',
    'unclassified',
  ];
  const ORIGINS: Classification['origin'][] = ['rule', 'llm', 'user'];
  const ALL: FinancialViewFinding[] = [
    finding('R01', 'savings'),
    finding('R05', 'savings'),
    finding('R06', 'savings'),
    finding('R05-REC', 'recovery'),
    finding('R06-REC', 'recovery'),
    finding('R04', 'savings'),
    finding('R02', 'alert', { howToReceive: [{ method: 'irpf_refund', summary: '', refIds: [] }] }),
    finding('R03', 'alert'),
    finding('A01', 'risk'),
    finding('A02', 'risk'),
  ];
  let seed = 7;
  const rand = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };

  it('properties over 600 random inputs: seals only from present findings, never from LLM or pending rows, no "gera crédito"', () => {
    for (let i = 0; i < 600; i += 1) {
      const regime = (['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL'] as const)[
        i % 4
      ] as FinancialViewInput['regime'];
      const findings = ALL.filter(() => rand() < 0.5);
      const txs: NormalizedTransaction[] = [];
      const cls: Classification[] = [];
      for (let k = 0; k < 6; k += 1) {
        const category = CATEGORIES[
          Math.floor(rand() * CATEGORIES.length)
        ] as Classification['category'];
        const t = tx({
          holder: rand() < 0.5 ? 'PJ' : 'PF',
          direction: rand() < 0.3 ? 'inflow' : 'outflow',
          date: `2026-${String(1 + Math.floor(rand() * 10)).padStart(2, '0')}-1${k}` as `${number}-${string}-${string}`,
          amountCents: 1 + Math.floor(rand() * 100_000),
        });
        txs.push(t);
        const label = LABELS[category];
        cls.push(
          classified(t, category, {
            status: STATUSES[Math.floor(rand() * STATUSES.length)] as Classification['status'],
            origin: ORIGINS[Math.floor(rand() * ORIGINS.length)] as Classification['origin'],
            ...(label === undefined ? {} : { ruleId: label }),
          }),
        );
      }
      const r = buildFinancialView({
        referenceMonth: '2026-10' as YearMonth,
        regime,
        transactions: txs,
        classifications: cls,
        findings,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const byId = new Map(cls.map((c) => [c.transactionId, c]));
      for (const h of [r.value.pj, r.value.pf]) {
        for (const g of h?.groups ?? []) {
          const rows = g.transactionIds.map((id) => byId.get(id) as Classification);
          for (const s of g.seals) {
            expect(s.kind).not.toBe('generates_credit');
            for (const id of s.ruleIds) expect(findings.some((f) => f.ruleId === id)).toBe(true);
            if (s.kind !== 'deductible') expect(s.ruleIds.length).toBeGreaterThan(0);
            else expect(s.ruleIds).toEqual([]);
            expect(
              rows.some(
                (c) => c.origin !== 'llm' && (c.status === 'applied' || c.status === 'confirmed'),
              ),
            ).toBe(true);
            expect(article(s.ref.id)).toBeDefined();
          }
          // Seal order is fixed.
          const order = [
            'money_to_receive',
            'lower_tax',
            'deductible',
            'generates_credit',
            'attention',
            'risk',
          ];
          const idx = g.seals.map((s) => order.indexOf(s.kind));
          expect([...idx].sort((a, b) => a - b)).toEqual(idx);
          if (rows.every((c) => c.origin === 'llm' || c.status === 'pending_confirmation'))
            expect(g.seals).toEqual([]);
        }
      }
    }
  });
});

// ---------- (d) citations exist ----------

describe('citations', () => {
  it('every hero seal’s ref.id exists in @refund/law (ARCHITECTURE §3.3, rule 7)', () => {
    const seals = [...(heroView.pj?.groups ?? []), ...(heroView.pf?.groups ?? [])].flatMap(
      (g) => g.seals,
    );
    expect(seals.length).toBeGreaterThan(0);
    for (const s of seals) expect(article(s.ref.id), s.ref.id).toBeDefined();
  });
});

// ---------- validation and ratioBps ----------

describe('input validation (FINANCIAL_VIEW_INVALID_INPUT)', () => {
  const t = tx({ amountCents: 100 });
  const base = { referenceMonth: '2026-10' as YearMonth, regime: 'SIMPLES' as const, findings: [] };
  it.each([
    [
      'bad month',
      { ...base, referenceMonth: '2026-13' as YearMonth, transactions: [t], classifications: [] },
    ],
    ['duplicate id', { ...base, transactions: [t, t], classifications: [] }],
    ['zero amount', { ...base, transactions: [{ ...t, amountCents: 0 }], classifications: [] }],
    ['float amount', { ...base, transactions: [{ ...t, amountCents: 1.5 }], classifications: [] }],
    [
      'orphan classification',
      { ...base, transactions: [], classifications: [classified(t, 'salary')] },
    ],
    [
      'two classifications',
      {
        ...base,
        transactions: [t],
        classifications: [classified(t, 'salary'), classified(t, 'salary')],
      },
    ],
  ] as const)('%s', (_, input) => {
    const r = buildFinancialView(input as FinancialViewInput);
    expect(r).toMatchObject({ ok: false, error: { code: 'FINANCIAL_VIEW_INVALID_INPUT' } });
    expect(r.ok ? '' : r.error.message).toMatch(/finanças/);
  });

  it('a transaction with no classification goes to "Sem categoria" and counts no origin', () => {
    const v = view({ transactions: [t] });
    expect(group(v.pj, 'unclassified')).toMatchObject({
      count: 1,
      byOrigin: { rule: 0, llm: 0, user: 0 },
      seals: [],
    });
  });

  it('an empty input gives null holders', () => {
    expect(view({ transactions: [] })).toMatchObject({ pj: null, pf: null });
  });
});

describe('ratioBps (half-up basis points)', () => {
  it.each([
    [279_000_00, 560_046_54, 4982],
    [1, 3, 3333],
    [2, 3, 6667],
    [1, 20_000, 1], // 0,5 bp → 1 (half-up)
    [-1, 20_000, -1], // away from zero on a tie, as the engine
    [-10_000, 20_000, -5000],
    [0, 5, 0],
  ])('%i / %i = %i bp', (n, d, bps) => expect(ratioBps(n, d)).toBe(bps));
  it('zero denominator → null; non-integer → RangeError', () => {
    expect(ratioBps(5, 0)).toBeNull();
    expect(() => ratioBps(0.5, 1)).toThrow(RangeError);
  });
});

import type {
  CivilDate,
  ProtectedDocument,
  PublicCompany,
  SourceAccount,
  SourceTransaction,
} from '@refund/sources';
import {
  addMonths,
  businessDayOnOrAfter,
  businessDayOnOrBefore,
  civil,
  nthBusinessDay,
} from '../calendar.ts';
import { PERSONA_CNPJS } from '../cnpjs.ts';
import { cnpjDocument, syntheticCpfDocument } from '../documents.ts';
import {
  COMPANY_NAMES,
  FOREIGN_CLIENT_NAMES,
  HOLDER_FIRST_NAMES,
  INSTITUTION_NAMES,
  MERCHANT_NAMES,
} from '../names.ts';
import { createPrng } from '../prng.ts';
import type {
  AnswerKey,
  AnswerKeyTransaction,
  CardAnswer,
  Category,
  Cents,
  ClassificationLabel,
  ExpectedFacts,
  ExpectedFinding,
  GeneratedPersona,
  PersonaData,
  SameHolderPair,
  Series,
  YearMonth,
} from '../types.ts';
import { cents } from '../types.ts';
import {
  DAS_HYPOTHESES,
  DCTFWEB,
  F2_MONTHS,
  PF_DEBITS,
  PRO_LABORE,
  SALARY,
  THIRTEENTH,
  VACATION_THIRD,
} from './table-f2.ts';

/** Fixed seed: only ids and the synthetic CPF masks come from it; every amount comes from F.2. */
export const DEV_EXPORTADOR_SEED = 20_261_112;

const PERSONA_ID = 'dev-exportador';
const ANALYSIS_DATE: CivilDate = '2026-11-12';
const REFERENCE_MONTH: YearMonth = '2026-10';
const FETCHED_AT = '2026-11-12T12:00:00.000Z';
const CNAE = '6201-5/01';
const HEALTH_PLAN_CNAE = '6550-2/00';
const GYM_CNAE = '9313-1/00';
const OPENING_BALANCE = { pj: 6_000_000, pf: 2_500_000 } as const;

interface Draft {
  tx: SourceTransaction;
  key: Omit<AnswerKeyTransaction, 'sourceId' | 'holder' | 'month' | 'amountCents'>;
}

export function generateDevExportador(seed: number = DEV_EXPORTADOR_SEED): GeneratedPersona {
  const prng = createPrng(seed);

  // Draw order is part of the determinism contract: documents first, then ids, then transactions.
  const holderCpf = syntheticCpfDocument(prng);
  const employeeCpf = { A: syntheticCpfDocument(prng), B: syntheticCpfDocument(prng) };
  const psychologistCpf = syntheticCpfDocument(prng);

  const pjCnpj = PERSONA_CNPJS.devExportador.cnpj;
  const pjDoc = cnpjDocument(pjCnpj);
  const healthPlanDoc = cnpjDocument(PERSONA_CNPJS.healthPlan.cnpj);
  const gymDoc = cnpjDocument(PERSONA_CNPJS.gym.cnpj);

  const ids = {
    pfItem: prng.uuid(),
    pjItem: prng.uuid(),
    pfChecking: prng.uuid(),
    pjChecking: prng.uuid(),
    pjCard: prng.uuid(),
  };

  const drafts: Record<'pfChecking' | 'pjChecking' | 'pjCard', Draft[]> = {
    pfChecking: [],
    pjChecking: [],
    pjCard: [],
  };

  const add = (
    account: keyof typeof drafts,
    t: Omit<SourceTransaction, 'sourceId' | 'accountSourceId' | 'pluggyType' | 'installment'>,
    label: ClassificationLabel | null,
    category: Category | null,
    cardId: string | null,
    note: string,
  ): string => {
    const sourceId = prng.uuid();
    drafts[account].push({
      tx: {
        sourceId,
        accountSourceId: ids[account],
        date: t.date,
        amountCents: t.amountCents,
        description: t.description,
        pluggyType: t.amountCents >= 0 ? 'CREDIT' : 'DEBIT',
        method: t.method,
        sourceCategory: t.sourceCategory,
        counterparty: t.counterparty,
        mcc: t.mcc,
        installment: null,
      },
      key: { label, category, cardId, note },
    });
    return sourceId;
  };

  const person = (document: ProtectedDocument) => ({ document, name: null, cnae: null });
  const company = (document: ProtectedDocument, name: string, cnae: string | null) => ({
    document,
    name,
    cnae,
  });
  const merchant = (name: string) => ({ document: null, name, cnae: null });

  const pairs: SameHolderPair[] = [];
  const cardTx: Record<string, string[]> = {
    proLabore: [],
    payroll: [],
    employeeA: [],
    employeeB: [],
    fx: [],
    distribution: [],
    psychologist: [],
  };

  // Pix between the PJ and the partner's PF: debit in the PJ, credit with the PJ's CNPJ as payer in
  // the PF, same amount and same date (ENGINE-SPEC E.2, rule 3; EXECUTION §9, 12/11).
  const sameHolderPix = (
    kind: SameHolderPair['kind'],
    date: CivilDate,
    amount: number,
    note: string,
  ): void => {
    const label: ClassificationLabel = kind === 'pro_labore' ? 'pro_labore' : 'distribution';
    const category: Category = kind === 'pro_labore' ? 'pro_labore' : 'profit_distribution';
    const cardId = kind === 'pro_labore' ? 'pro-labore-gross' : 'monthly-distribution';
    const pjId = add(
      'pjChecking',
      {
        date,
        amountCents: -amount,
        description: 'PIX ENVIADO [pessoa]',
        method: 'PIX',
        sourceCategory: null,
        counterparty: person(holderCpf),
        mcc: null,
      },
      label,
      category,
      cardId,
      note,
    );
    const pfId = add(
      'pfChecking',
      {
        date,
        amountCents: amount,
        description: `PIX RECEBIDO - ${COMPANY_NAMES.devExportador.legalName}`,
        method: 'PIX',
        sourceCategory: null,
        counterparty: company(pjDoc, COMPANY_NAMES.devExportador.legalName, null),
        mcc: null,
      },
      // E.2/E.3 classify only the PJ debit; the PF credit confirms the match (rule 3) and must not
      // be counted again: no label, category same_holder_transfer (EXECUTION §9, 14/11).
      null,
      'same_holder_transfer',
      null,
      `PF leg of ${pjId} (${kind}); counted on the PJ leg only; ${note}`,
    );
    pairs.push({ kind, pjTransactionId: pjId, pfTransactionId: pfId, amountCents: amount });
    (kind === 'pro_labore' ? cardTx.proLabore : cardTx.distribution)?.push(pjId);
  };

  for (const row of F2_MONTHS) {
    const m = row.month;
    const pa = addMonths(m, -1);
    const paLabel = `${pa.slice(5)}/${pa.slice(0, 4)}`;
    const payday = nthBusinessDay(m, 5);
    const taxDay = businessDayOnOrBefore(m, 20);

    // FX credit: export revenue of the month (accrual).
    cardTx.fx?.push(
      add(
        'pjChecking',
        {
          date: businessDayOnOrAfter(m, 6),
          amountCents: row.fx,
          description: `CAMBIO - ORDEM DE PAGAMENTO DO EXTERIOR - ${FOREIGN_CLIENT_NAMES.devExportador}`,
          method: 'FX',
          sourceCategory: null,
          counterparty: merchant(FOREIGN_CLIENT_NAMES.devExportador),
          mcc: null,
        },
        'export_revenue',
        'export_revenue',
        'export-qualification',
        `F.2 FX ${m}: export revenue, accrual ${m}`,
      ),
    );

    // Salaries (net), 13º and ⅓ vacation, by Pix to each employee's CPF.
    for (const employee of ['A', 'B'] as const) {
      const pay = (date: CivilDate, amount: number, suffix: string, note: string): void => {
        const id = add(
          'pjChecking',
          {
            date,
            amountCents: -amount,
            description: `PIX ENVIADO [pessoa]${suffix}`,
            method: 'PIX',
            sourceCategory: null,
            counterparty: person(employeeCpf[employee]),
            mcc: null,
          },
          'salary',
          'salary',
          `clt-employee-${employee}`,
          note,
        );
        cardTx.payroll?.push(id);
        cardTx[`employee${employee}`]?.push(id);
      };
      pay(payday, SALARY.net, '', `salary of employee ${employee}, gross 5.100,00 (F.2 note)`);
      if (row.vacationThird?.employee === employee) {
        pay(
          payday,
          VACATION_THIRD.net,
          ' FERIAS',
          `⅓ vacation of employee ${employee}, gross 1.700,00 (F.2); net 816,99 is a SYNTHETIC CONVENTION, not in F.2 (EXECUTION §9, 14/11)`,
        );
      }
      if (row.thirteenthPerEmployee > 0) {
        pay(
          businessDayOnOrBefore(m, 18),
          THIRTEENTH.net,
          ' 13 SALARIO',
          `13º of employee ${employee}, gross 5.100,00 (F.2); net 4.548,68 is a SYNTHETIC CONVENTION, not in F.2 (EXECUTION §9, 14/11)`,
        );
      }
    }

    // Pró-labore (net), same day as the payroll.
    sameHolderPix(
      'pro_labore',
      payday,
      PRO_LABORE.net,
      `pró-labore ${m}: gross 1.621,00, net 1.442,69 (F.2)`,
    );

    // FGTS paid (FGTS Digital guide).
    add(
      'pjChecking',
      {
        date: taxDay,
        amountCents: -row.fgtsPaid,
        description: `PAGAMENTO GUIA FGTS DIGITAL - GFD COMP ${paLabel}`,
        method: 'BOLETO',
        sourceCategory: null,
        counterparty: null,
        mcc: null,
      },
      'fgts',
      'fgts_charge',
      null,
      `F.2 FGTS paid ${m}`,
    );

    // DAS of the previous month's PA.
    add(
      'pjChecking',
      {
        date: taxDay,
        amountCents: -row.das,
        description: `PAGAMENTO DAS - SIMPLES NACIONAL PA ${paLabel}`,
        method: 'BOLETO',
        sourceCategory: null,
        counterparty: null,
        mcc: null,
      },
      'das_simples',
      'das_tax',
      null,
      `F.2 DAS paid ${m} for PA ${pa}`,
    );

    // Monthly DCTFWeb (INSS + IRRF of the previous month's payroll and pró-labore).
    add(
      'pjChecking',
      {
        date: taxDay,
        amountCents: -DCTFWEB.total,
        description: `PAGAMENTO DARF NUMERADO - DCTFWEB PA ${paLabel}`,
        method: 'BOLETO',
        sourceCategory: null,
        counterparty: null,
        mcc: null,
      },
      'dctfweb',
      'darf_tax',
      null,
      'F.2 note: monthly DCTFWeb = INSS 1.209,33 + IRRF 71,62',
    );

    // Distribution to the partner (net credited).
    sameHolderPix(
      'distribution',
      businessDayOnOrAfter(m, 10),
      row.netDistribution,
      row.netDistribution === row.grossDistribution
        ? `distribution ${m}: gross ${row.grossDistribution / 100} (F.2)`
        : `distribution ${m}: gross ${row.grossDistribution / 100}, IRRF 10% withheld, DARF 1841 in ${addMonths(m, 1)} (F.2)`,
    );

    if (row.darf1841 > 0) {
      add(
        'pjChecking',
        {
          date: taxDay,
          amountCents: -row.darf1841,
          description: `PAGAMENTO DARF 1841 - IRRF LUCROS E DIVIDENDOS PA ${paLabel}`,
          method: 'BOLETO',
          sourceCategory: null,
          counterparty: null,
          mcc: null,
        },
        'darf_irrf_dividends',
        'darf_tax',
        null,
        `F.2 DARF 1841 ${m}: IRRF withheld on the distribution of ${pa}`,
      );
    }

    // Personal spending on the PJ card (A01).
    add(
      'pjCard',
      {
        date: civil(Number(m.slice(0, 4)), Number(m.slice(5)), 12),
        amountCents: -row.netflix,
        description: MERCHANT_NAMES.streaming,
        method: 'CARD',
        sourceCategory: null,
        counterparty: merchant(MERCHANT_NAMES.streaming),
        mcc: '4899',
      },
      'personal_in_pj',
      'personal_expense_in_pj',
      null,
      `F.2 Netflix on the PJ card ${m}`,
    );
    if (row.supermarket > 0) {
      add(
        'pjCard',
        {
          date: civil(Number(m.slice(0, 4)), Number(m.slice(5)), 14),
          amountCents: -row.supermarket,
          // Card statements truncate the merchant name; `SUPERMERC` is the E.7 keyword.
          description: 'SUPERMERC VILA SERENA',
          method: 'CARD',
          sourceCategory: null,
          counterparty: merchant(MERCHANT_NAMES.supermarket),
          mcc: '5411',
        },
        'personal_in_pj',
        'personal_expense_in_pj',
        null,
        `F.2 supermarket on the PJ card ${m}`,
      );
    }

    // The partner's PF debits.
    add(
      'pfChecking',
      {
        date: businessDayOnOrAfter(m, 10),
        amountCents: -PF_DEBITS.healthPlan,
        description: `PAGAMENTO BOLETO - ${COMPANY_NAMES.healthPlan.legalName}`,
        method: 'BOLETO',
        sourceCategory: null,
        counterparty: company(healthPlanDoc, COMPANY_NAMES.healthPlan.legalName, HEALTH_PLAN_CNAE),
        mcc: null,
      },
      'deductible_health',
      'deductible_health',
      null,
      `F.2 health plan ${m} (CNAE 6550-2/00)`,
    );
    cardTx.psychologist?.push(
      add(
        'pfChecking',
        {
          date: businessDayOnOrAfter(m, 25),
          amountCents: -PF_DEBITS.psychologist,
          description: 'PIX ENVIADO [pessoa]',
          method: 'PIX',
          sourceCategory: null,
          counterparty: person(psychologistCpf),
          mcc: null,
        },
        'health_to_confirm',
        'deductible_health',
        'psychologist-beneficiary',
        `F.2 psychologist ${m} (Pix to a CPF; card answer: care for the holder)`,
      ),
    );
    add(
      'pfChecking',
      {
        date: businessDayOnOrAfter(m, 3),
        amountCents: -PF_DEBITS.gym,
        description: `PIX ENVIADO - ${COMPANY_NAMES.gym.legalName}`,
        method: 'PIX',
        sourceCategory: null,
        counterparty: company(gymDoc, COMPANY_NAMES.gym.legalName, GYM_CNAE),
        mcc: null,
      },
      'non_deductible',
      // ARCHITECTURE §4.4 has no category for a non-deductible PF expense (EXECUTION §9, 14/11).
      null,
      null,
      `F.2 gym ${m} (CNAE 9313-1/00, not deductible)`,
    );
  }

  // ---------- Accounts and items ----------

  const ordered = (list: Draft[]): Draft[] =>
    [...list].sort((a, b) => (a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : 0));
  const sum = (list: Draft[]): number => list.reduce((s, d) => s + d.tx.amountCents, 0);

  const account = (
    key: keyof typeof drafts,
    holder: 'PF' | 'PJ',
    type: SourceAccount['type'],
    subtype: SourceAccount['subtype'],
    productName: string,
    balanceCents: number | null,
  ): SourceAccount => ({
    sourceId: ids[key],
    holder,
    type,
    subtype,
    productName,
    institution: INSTITUTION_NAMES.bank,
    currency: 'BRL',
    balanceCents,
  });

  const pf = ordered(drafts.pfChecking);
  const pj = ordered(drafts.pjChecking);
  const card = ordered(drafts.pjCard);

  const company_: PublicCompany = {
    cnpj: pjCnpj,
    displayLegalName: COMPANY_NAMES.devExportador.legalName,
    displayTradeName: COMPANY_NAMES.devExportador.tradeName,
    masked: false,
    legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
    size: 'EPP',
    primaryCnae: {
      code: CNAE,
      description: 'Desenvolvimento de programas de computador sob encomenda',
    },
    secondaryCnaes: [],
    registrationStatus: 'ATIVA',
    activityStartDate: '2019-03-11',
    uf: 'SP',
    ibgeMunicipality: '3550308',
    simples: { optedIn: true, since: '2019-03-11', excludedAt: null },
    mei: { optedIn: false, since: null, excludedAt: null },
    taxRegimeHistory: [],
    source: 'persona',
    fetchedAt: FETCHED_AT,
  };

  const data: PersonaData = {
    schemaVersion: 1,
    id: PERSONA_ID,
    seed,
    synthetic: true,
    holderDisplayName: HOLDER_FIRST_NAMES[PERSONA_ID],
    analysisDate: ANALYSIS_DATE,
    referenceMonth: REFERENCE_MONTH,
    period: { from: '2025-11-01', to: '2026-10-31' },
    company: company_,
    items: [
      {
        holder: 'PJ',
        item: {
          sourceId: ids.pjItem,
          clientUserId: null,
          status: 'UPDATED',
          executionStatus: 'SUCCESS',
          connector: {
            id: 0,
            name: INSTITUTION_NAMES.connectorPj,
            sandbox: true,
            type: 'BUSINESS_BANK',
          },
        },
        identity: {
          holder: 'PJ',
          document: pjDoc,
          economicActivities: [CNAE],
          partnerDocuments: [holderCpf],
        },
        accounts: [
          {
            account: account(
              'pjChecking',
              'PJ',
              'BANK',
              'CHECKING_ACCOUNT',
              'Conta Corrente PJ',
              OPENING_BALANCE.pj + sum(pj),
            ),
            transactions: pj.map((d) => d.tx),
          },
          {
            account: account(
              'pjCard',
              'PJ',
              'CREDIT',
              'CREDIT_CARD',
              'Cartão de Crédito Empresarial',
              null,
            ),
            transactions: card.map((d) => d.tx),
          },
        ],
      },
      {
        holder: 'PF',
        item: {
          sourceId: ids.pfItem,
          clientUserId: null,
          status: 'UPDATED',
          executionStatus: 'SUCCESS',
          connector: {
            id: 0,
            name: INSTITUTION_NAMES.connectorPf,
            sandbox: true,
            type: 'PERSONAL_BANK',
          },
        },
        identity: {
          holder: 'PF',
          document: holderCpf,
          economicActivities: [],
          partnerDocuments: [],
        },
        accounts: [
          {
            account: account(
              'pfChecking',
              'PF',
              'BANK',
              'CHECKING_ACCOUNT',
              'Conta Corrente',
              OPENING_BALANCE.pf + sum(pf),
            ),
            transactions: pf.map((d) => d.tx),
          },
        ],
      },
    ],
  };

  // ---------- Answer key ----------

  const keyOf = (holder: 'PF' | 'PJ', d: Draft): AnswerKeyTransaction => ({
    sourceId: d.tx.sourceId,
    holder,
    month: d.tx.date.slice(0, 7) as YearMonth,
    amountCents: d.tx.amountCents,
    ...d.key,
  });
  const transactions = [
    ...pj.map((d) => keyOf('PJ', d)),
    ...card.map((d) => keyOf('PJ', d)),
    ...pf.map((d) => keyOf('PF', d)),
  ];

  const answerKey: AnswerKey = {
    schemaVersion: 1,
    personaId: PERSONA_ID,
    source: 'ENGINE-SPEC F.2–F.4 (verified 12/11/2026)',
    transactions,
    sameHolderPairs: pairs,
    expectedFacts: expectedFacts(pjCnpj, pj, cardTx),
    cardAnswers: cardAnswers(cardTx),
    expectedFindings: expectedFindings(),
    total: {
      savings12m: cents(6_231_892),
      annualRegimeSavings: cents(7_400_628),
      byConfidence: {
        confirmed: cents(6_231_892),
        estimated: cents(0),
        depends_on_regulation: cents(0),
      },
      recoveryRange: [cents(3_978_768), cents(19_893_840)],
    },
    videoNumbers: [
      { screen: 'analysis', testId: 'analysis/money-hero', cents: cents(6_231_892) },
      { screen: 'dashboard', testId: 'dashboard/money-hero', cents: cents(6_231_892) },
      { screen: 'dashboard', testId: 'dashboard/regime-total', cents: cents(7_400_628) },
      { screen: 'dashboard', testId: 'dashboard/recovery-min', cents: cents(3_978_768) },
      { screen: 'dashboard', testId: 'dashboard/recovery-max', cents: cents(19_893_840) },
      { screen: 'dashboard', testId: 'dashboard/alert-R02-cost', cents: cents(111_170) },
    ],
  };

  return { data, answerKey };
}

const range = (min: number, max: number): [Cents, Cents] => [cents(min), cents(max)];

function notFired(ruleId: ExpectedFinding['ruleId'], note: string): ExpectedFinding {
  return {
    ruleId,
    fires: false,
    type: null,
    confidence: null,
    countsInTotal: false,
    marginalValue12m: null,
    annualRegimeValue: null,
    regimeFrom: null,
    range: null,
    byDestination: null,
    deadline: null,
    details: {},
    note,
  };
}

/** ENGINE-SPEC F.3 (engine run), F.4 (expected result), D.2, D.5/T05-09 and C.12.4. */
function expectedFindings(): ExpectedFinding[] {
  const base = {
    fires: true,
    marginalValue12m: null,
    annualRegimeValue: null,
    regimeFrom: null,
    range: null,
    byDestination: null,
    deadline: null,
  } as const;
  return [
    {
      ...base,
      ruleId: 'R01',
      type: 'savings',
      confidence: 'confirmed',
      countsInTotal: true,
      marginalValue12m: cents(2_831_652),
      annualRegimeValue: cents(4_289_652),
      regimeFrom: '2027-04',
      details: {
        start: '2026-12',
        currentProLabore: 162_100,
        proLaboreTarget: 226_000, // P* with the 1 p.p. margin (29% target)
        proLaboreAt28: 176_000,
        inssPartnerMonthly: 24_860,
        cost12mS0: 10_923_972,
        cost12mS1: 8_092_320,
        regimeCostS1: 6_634_320,
        bringForwardProLabore: 328_900, // trace only, outside the total
        bringForwardExtraGain: 573_049,
      },
      note: 'pró-labore 1.621 → 2.260 from 2026-12; Anexo V → III from PA 2027-04 (F.3 step 3)',
    },
    {
      ...base,
      ruleId: 'R05',
      type: 'savings',
      confidence: 'confirmed',
      countsInTotal: true,
      marginalValue12m: cents(3_400_240),
      annualRegimeValue: cents(3_110_976),
      details: { start: '2026-12', cost12mS2: 4_692_080, regimeCostS2: 3_523_344 },
      note: 'segregate exports in the PGDAS-D from PA 2026-12 (F.3 step 4; C.12.3)',
    },
    notFired('R06', 'CNAE not on the monofásico list (F.3 step 5)'),
    notFired('R04', 'IR already zero in 2026 and 2027 (F.3 step 6); the UI shows T04-12'),
    {
      ...base,
      ruleId: 'R05-REC',
      type: 'recovery',
      confidence: 'estimated',
      countsInTotal: false,
      range: range(3_978_768, 19_893_840),
      byDestination: {
        federal: range(1_943_868, 9_719_340),
        municipal: range(2_034_900, 10_174_500),
        state: range(0, 0),
      },
      deadline: '2026-11-23',
      details: {
        measuredPas: 12,
        projectedPas: 48,
        overpaymentPerPa: 331_564,
        federalPerPa: 161_989,
        issPerPa: 169_575,
        oldestPa: '2021-10',
        oldestPaPaymentDate: '2021-11-22', // projected: estimated by the due date (C.12.2)
      },
      note: 'without Selic; PA 10/2021 expires 23/11/2026 (T05-09, C.12.4, T12-02)',
    },
    {
      ...base,
      ruleId: 'R02',
      type: 'alert',
      confidence: 'estimated',
      countsInTotal: false,
      // D.2: marginalValue12m = Σ financialCost = 9.000 × (1,15^(10/12) − 1)
      marginalValue12m: cents(111_170),
      details: {
        month: '2026-07',
        grossDistribution: 9_000_000,
        irrfWithheld: 900_000,
        darfMonth: '2026-08',
        dividendRefundMonth: '2027-06',
        selicAnnual: '0.15',
        suggestedSplit: 2,
        suggestedMonthly: 4_500_000,
      },
      note: 'cash alert outside the total; distributions above the bookkeeping-free limit are information only (bookkeeping confirmed)',
    },
    {
      ...base,
      ruleId: 'A01',
      type: 'risk',
      confidence: 'confirmed',
      countsInTotal: false,
      details: { netflixCount: 12, supermarketCount: 1 },
      note: 'Netflix (12×) and supermarket (1×) on the PJ card (E.7); no R$',
    },
    notFired('A02', 'P0 = minimum wage'),
    notFired('R03', 'RBT12 600.000, far from 2,88 mi'),
  ];
}

function series(pick: (row: (typeof F2_MONTHS)[number]) => number): Series {
  const out: Series = {};
  for (const row of F2_MONTHS) out[row.month] = cents(pick(row));
  return out;
}

function total(pick: (row: (typeof F2_MONTHS)[number]) => number): number {
  return F2_MONTHS.reduce((s, row) => s + pick(row), 0);
}

function expectedFacts(pjCnpj: string, pj: Draft[], tx: Record<string, string[]>): ExpectedFacts {
  const idsOf = (label: ClassificationLabel): string[] =>
    pj.filter((d) => d.key.label === label).map((d) => d.tx.sourceId);
  const rbt12 = total((r) => r.fx);
  const fs12 = total((r) => r.grossClt + r.fgtsPaid + r.grossProLabore);
  const dasDates = new Map(
    pj.filter((d) => d.key.label === 'das_simples').map((d) => [d.tx.date.slice(0, 7), d.tx.date]),
  );
  return {
    referenceMonth: REFERENCE_MONTH,
    analysisDate: ANALYSIS_DATE,
    rbt12: cents(rbt12),
    fs12: cents(fs12),
    // 166.332 / 600.000, exact (displayed truncated as 0,27; ENGINE-SPEC F.3).
    fatorR: '0.27722',
    anexo: 'V',
    company: {
      cnpj: pjCnpj,
      primaryCnae: CNAE,
      regime: 'SIMPLES',
      uf: 'SP',
      openedOn: '2019-03-11',
    },
    companyDetails: {
      subjectToFatorR: true,
      baseAnexo: 'III',
      resellsMonofasico: false,
      hasFullBookkeeping: true,
    },
    revenueByMarket: { domestic: series(() => 0), export: series((r) => r.fx) },
    cltPayroll: {
      grossPay: series((r) => r.grossClt),
      fgtsPaid: series((r) => r.fgtsPaid),
      cppOutsideDas: series(() => 0),
    },
    partner: {
      worksInCompany: true,
      grossProLabore: series((r) => r.grossProLabore),
      distributions: F2_MONTHS.map((r) => ({
        month: r.month,
        payerCnpj: pjCnpj,
        grossAmount: cents(r.grossDistribution),
        irrfWithheld: cents(r.grossDistribution - r.netDistribution),
        profitThrough2025Approved: false,
      })),
    },
    dasPaid: F2_MONTHS.map((r) => {
      const paymentDate = dasDates.get(r.month);
      if (paymentDate === undefined) throw new Error(`no DAS generated in ${r.month}`);
      return {
        pa: addMonths(r.month, -1),
        amount: cents(r.das),
        paymentDate: paymentDate as CivilDate,
      };
    }),
    qualifications: {
      exportResultAbroad: true,
      pgdasSegregatesExport: 'no',
      contributesToRgps: true,
    },
    pgdasInference: {
      hypothesis: 'V_not_segregated',
      matchedPas: F2_MONTHS.filter((r) => r.das === DAS_HYPOTHESES.vNotSegregated).length,
      expectedDasByHypothesis: {
        vNotSegregated: cents(DAS_HYPOTHESES.vNotSegregated),
        vSegregated: cents(DAS_HYPOTHESES.vSegregated),
        iiiNotSegregated: cents(DAS_HYPOTHESES.iiiNotSegregated),
        iiiSegregated: cents(DAS_HYPOTHESES.iiiSegregated),
      },
    },
    pfDetails: {
      monthlyTaxableIncome: series((r) => r.grossProLabore),
      officialPensionDeductions: series(() => PRO_LABORE.inss),
      dependents: 0,
      healthExpenses: [
        {
          amount: cents(12 * PF_DEBITS.healthPlan),
          cnaeOrProfession: HEALTH_PLAN_CNAE,
          beneficiary: 'holder',
        },
        {
          amount: cents(12 * PF_DEBITS.psychologist),
          cnaeOrProfession: 'psychologist',
          beneficiary: 'holder',
        },
      ],
      educationExpenses: [],
      pgblContributedThisYear: cents(0),
      // pró-labore 19.452 + gross distributions 288.000 (F.2: "total income for the year < 600 mil");
      // calendar 2026 with nov–dec projected as nov–dec/2025 gives the same (EXECUTION §9, 14/11).
      projectedAnnualTotalIncome: cents(total((r) => r.grossProLabore + r.grossDistribution)),
    },
    provenance: {
      'companyDetails.subjectToFatorR': {
        origin: 'cnpj',
        source: 'CNAE 6201-5/01: LC 123, art. 18, § 5º-M, II (ENGINE-SPEC E.4)',
      },
      'companyDetails.baseAnexo': {
        origin: 'cnpj',
        source:
          'CNAE 6201-5/01: LC 123, art. 18, § 5º-D, IV (Anexo III; V below Fator R 28%, § 5º-M)',
      },
      'companyDetails.hasFullBookkeeping': {
        origin: 'user',
        source: 'question:full-bookkeeping',
      },
      'partner.worksInCompany': { origin: 'user', source: 'question:partner-works-in-company' },
      'partner.grossProLabore': {
        origin: 'user',
        transactionIds: tx.proLabore ?? [],
        source: 'question:pro-labore-gross',
      },
      'cltPayroll.grossPay': {
        origin: 'user',
        transactionIds: tx.payroll ?? [],
        source: 'question:clt-payroll-gross',
      },
      'qualifications.exportResultAbroad': {
        origin: 'user',
        transactionIds: tx.fx ?? [],
        source: 'question:export-qualification',
      },
      'qualifications.pgdasSegregatesExport': {
        origin: 'derived',
        transactionIds: [...idsOf('das_simples'), ...(tx.fx ?? [])],
        source: 'C.3.7: 12 DAS paid = hypothesis V not segregated',
      },
      'qualifications.contributesToRgps': {
        origin: 'derived',
        transactionIds: [...idsOf('dctfweb'), ...(tx.proLabore ?? [])],
        source:
          'C.2 "there is INSS on the pró-labore/salary": INSS 11% (178,31) on the confirmed gross pró-labore, remitted in the monthly DCTFWeb',
      },
      'pfDetails.projectedAnnualTotalIncome': {
        origin: 'derived',
        transactionIds: [...(tx.proLabore ?? []), ...(tx.distribution ?? [])],
        source: 'gross pró-labore (card) + gross distributions (net credit + DARF 1841)',
      },
    },
    totals12m: {
      exportRevenue: cents(rbt12),
      grossCltPay: cents(total((r) => r.grossClt)),
      fgtsPaid: cents(total((r) => r.fgtsPaid)),
      grossProLabore: cents(total((r) => r.grossProLabore)),
      dasPaid: cents(total((r) => r.das)),
      grossDistributions: cents(total((r) => r.grossDistribution)),
      darf1841: cents(total((r) => r.darf1841)),
      personalOnPjCard: cents(total((r) => r.netflix + r.supermarket)),
      pfHealthPlan: cents(12 * PF_DEBITS.healthPlan),
      pfPsychologist: cents(12 * PF_DEBITS.psychologist),
      pfGym: cents(12 * PF_DEBITS.gym),
      pfTotalIncome: cents(total((r) => r.grossProLabore + r.grossDistribution)),
    },
  };
}

function cardAnswers(tx: Record<string, string[]>): CardAnswer[] {
  const ids = (key: string): string[] => tx[key] ?? [];
  const source = 'ENGINE-SPEC F.2, "Cards answered (all yes)"';
  return [
    {
      id: 'pro-labore-gross',
      type: 'monthly_pro_labore',
      question: 'Seu pró-labore bruto é R$ 1.621,00 por mês?',
      answer: PRO_LABORE.gross,
      transactionIds: ids('proLabore'),
      source,
    },
    {
      id: 'clt-payroll-gross',
      type: 'assumption',
      question: 'Qual é a folha bruta mensal (relatório do contador)?',
      answer: series((r) => r.grossClt),
      transactionIds: ids('payroll'),
      source,
    },
    {
      id: 'clt-employee-A',
      type: 'transaction',
      question: 'Esta pessoa é empregada com carteira?',
      answer: true,
      transactionIds: ids('employeeA'),
      source: `${source}: implied by the gross CLT payroll card (one card per person, E.2)`,
    },
    {
      id: 'clt-employee-B',
      type: 'transaction',
      question: 'Esta pessoa é empregada com carteira?',
      answer: true,
      transactionIds: ids('employeeB'),
      source: `${source}: implied by the gross CLT payroll card (one card per person, E.2)`,
    },
    {
      id: 'export-qualification',
      type: 'transaction',
      question: 'Estes créditos são de clientes no exterior, por serviço usufruído lá?',
      answer: true,
      transactionIds: ids('fx'),
      source,
    },
    {
      id: 'partner-works-in-company',
      type: 'assumption',
      question: 'Você trabalha na empresa?',
      answer: true,
      transactionIds: [],
      source,
    },
    {
      id: 'monthly-distribution',
      type: 'transaction',
      question:
        'Os PIX para você além do pró-labore (R$ 18.000,00 por mês; R$ 81.000,00 em julho) são distribuição de lucros?',
      answer: true,
      transactionIds: ids('distribution'),
      source,
    },
    {
      id: 'full-bookkeeping',
      type: 'assumption',
      question: 'A empresa tem escrituração contábil completa?',
      answer: true,
      transactionIds: [],
      source,
    },
    {
      id: 'psychologist-beneficiary',
      type: 'transaction',
      question: 'Foi atendimento de saúde de você ou de dependente? Com qual profissional?',
      answer: 'holder',
      transactionIds: ids('psychologist'),
      source,
    },
  ];
}

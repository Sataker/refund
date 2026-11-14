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
  ClassificationLabel,
  ExpectedFacts,
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
    label: ClassificationLabel,
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
      label,
      category,
      null,
      `PF leg of ${pjId}; ${note}`,
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
          `⅓ vacation of employee ${employee}, gross 1.700,00 (F.2); net per generator convention`,
        );
      }
      if (row.thirteenthPerEmployee > 0) {
        pay(
          businessDayOnOrBefore(m, 18),
          THIRTEENTH.net,
          ' 13 SALARIO',
          `13º of employee ${employee}, gross 5.100,00 (F.2); net per generator convention`,
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
    expectedFacts: expectedFacts(pjCnpj, pj),
    cardAnswers: cardAnswers(cardTx),
    expectedFindings: [
      finding(
        'R01',
        'confirmed',
        true,
        2_831_652,
        4_289_652,
        null,
        null,
        'pró-labore 1.621 → 2.260; Anexo V → III from 2027-04',
      ),
      finding(
        'R05',
        'confirmed',
        true,
        3_400_240,
        3_110_976,
        null,
        null,
        'segregate exports in the PGDAS-D',
      ),
      finding(
        'R06',
        null,
        false,
        null,
        null,
        null,
        null,
        'CNAE not on the monofásico list (F.3 step 5): no finding',
      ),
      finding(
        'R04',
        null,
        false,
        null,
        null,
        null,
        null,
        'IR already zero in 2026 and 2027 (F.3 step 6): no finding; UI shows T04-12',
      ),
      finding(
        'R05-REC',
        'estimated',
        false,
        null,
        null,
        { min: 3_978_768, max: 19_893_840 },
        null,
        '12 measured PAs × 3.315,64 to 60 PAs; without Selic; PA 10/2021 expires 23/11/2026',
      ),
      finding(
        'R02',
        'estimated',
        false,
        null,
        null,
        null,
        111_170,
        'jul/2026 distribution of 90.000: withheld 9.000,00 (DARF 1841); suggestion 2 × 45.000',
      ),
      finding(
        'A01',
        'confirmed',
        false,
        null,
        null,
        null,
        null,
        'Netflix (12×) and supermarket (1×) on the PJ card',
      ),
      finding('A02', null, false, null, null, null, null, 'does not fire: P0 = minimum wage'),
      finding(
        'R03',
        null,
        false,
        null,
        null,
        null,
        null,
        'does not fire: RBT12 600.000, far from 2,88 mi',
      ),
    ],
    expectedTotal: { next12m: cents(6_231_892), annualRegime: cents(7_400_628) },
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

function finding(
  ruleId: AnswerKey['expectedFindings'][number]['ruleId'],
  confidence: 'confirmed' | 'estimated' | null,
  countsInTotal: boolean,
  marginalValue12m: number | null,
  annualRegimeValue: number | null,
  range: { min: number; max: number } | null,
  cashCost: number | null,
  note: string,
): AnswerKey['expectedFindings'][number] {
  return {
    ruleId,
    confidence,
    countsInTotal,
    marginalValue12m: marginalValue12m === null ? null : cents(marginalValue12m),
    annualRegimeValue: annualRegimeValue === null ? null : cents(annualRegimeValue),
    range: range === null ? null : { min: cents(range.min), max: cents(range.max) },
    cashCost: cashCost === null ? null : cents(cashCost),
    note,
  };
}

function series(pick: (row: (typeof F2_MONTHS)[number]) => number): Series {
  const out: Series = {};
  for (const row of F2_MONTHS) out[row.month] = cents(pick(row));
  return out;
}

function total(pick: (row: (typeof F2_MONTHS)[number]) => number): number {
  return F2_MONTHS.reduce((s, row) => s + pick(row), 0);
}

function expectedFacts(pjCnpj: string, pj: Draft[]): ExpectedFacts {
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
    companyDetails: { subjectToFatorR: true, resellsMonofasico: false, hasFullBookkeeping: true },
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

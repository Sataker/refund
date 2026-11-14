import type { YearMonth } from '../types.ts';

// ENGINE-SPEC F.2 (hero facts, nov/2025 to oct/2026), transcribed as cents. This file is the only
// place the generator reads numbers from; tests compare the generated statement against it and
// against an independent transcription of the Σ 12m row.

export interface F2Month {
  month: YearMonth;
  /** FX credit (export revenue, accrual = month of the credit). */
  fx: number;
  /** Gross CLT remuneration paid in the month (cash). */
  grossClt: number;
  /** 13º salary paid in the month, gross, per employee (part of `grossClt`). */
  thirteenthPerEmployee: number;
  /** ⅓ vacation bonus paid in the month (part of `grossClt`), and to which employee. */
  vacationThird: { employee: 'A' | 'B'; gross: number } | null;
  fgtsPaid: number;
  grossProLabore: number;
  /** DAS paid in the month, for the previous month's PA. */
  das: number;
  grossDistribution: number;
  /** Net credited to the partner (gross − IRRF withheld). */
  netDistribution: number;
  darf1841: number;
  netflix: number;
  supermarket: number;
}

const base = {
  fx: 5_000_000,
  grossClt: 1_020_000,
  thirteenthPerEmployee: 0,
  vacationThird: null,
  fgtsPaid: 81_600,
  grossProLabore: 162_100,
  das: 892_500,
  grossDistribution: 1_800_000,
  netDistribution: 1_800_000,
  darf1841: 0,
  netflix: 5_590,
  supermarket: 0,
} as const satisfies Omit<F2Month, 'month'>;

export const F2_MONTHS: readonly F2Month[] = [
  { ...base, month: '2025-11' },
  {
    ...base,
    month: '2025-12',
    // 10.200 + 13º 10.200 + ⅓ vacation A 1.700
    grossClt: 2_210_000,
    thirteenthPerEmployee: 510_000,
    vacationThird: { employee: 'A', gross: 170_000 },
    fgtsPaid: 122_400,
  },
  { ...base, month: '2026-01', fgtsPaid: 136_000 },
  { ...base, month: '2026-02' },
  { ...base, month: '2026-03', supermarket: 81_240 },
  { ...base, month: '2026-04' },
  { ...base, month: '2026-05' },
  // + ⅓ vacation B 1.700
  {
    ...base,
    month: '2026-06',
    grossClt: 1_190_000,
    vacationThird: { employee: 'B', gross: 170_000 },
  },
  // distribution of 90.000 gross, 81.000 net (IRRF 10% withheld, paid by DARF 1841 in August)
  {
    ...base,
    month: '2026-07',
    fgtsPaid: 95_200,
    grossDistribution: 9_000_000,
    netDistribution: 8_100_000,
  },
  { ...base, month: '2026-08', darf1841: 900_000 },
  { ...base, month: '2026-09' },
  { ...base, month: '2026-10' },
];

// ---------- Generator notes of F.2 (net amounts in the statement) ----------

/** Monthly salary of each of the 2 employees: 5.100 − INSS 515,51 − IRRF 35,81 = 4.548,68. */
export const SALARY = { gross: 510_000, inss: 51_551, irrf: 3_581, net: 454_868 } as const;

/** Pró-labore: 1.621 − INSS 11% 178,31 − IRRF 0 = 1.442,69. */
export const PRO_LABORE = { gross: 162_100, inss: 17_831, irrf: 0, net: 144_269 } as const;

/** Monthly DCTFWeb: INSS 1.209,33 (2 × 515,51 + 178,31) + IRRF 71,62. */
export const DCTFWEB = { inss: 120_933, irrf: 7_162, total: 128_095 } as const;

// SYNTHETIC CONVENTION, not ENGINE-SPEC data. F.2 does not specify the net of the 13º and of the
// ⅓ vacation (EXECUTION §9, 14/11); the amounts below are this generator's choice.
// They do not feed any number (the gross payroll comes from the card, ENGINE-SPEC E.2). Convention:
// - 13º: taxed exclusively, same formula as the salary (simplified discount 607,20; Lei 15.270
//   reduction applies to the 13º, ENGINE-SPEC A.1) → same 4.548,68 per employee;
// - ⅓ vacation: INSS and IRRF on the month's total remuneration (5.100 + 1.700 = 6.800) minus
//   what the salary already withheld: INSS 753,51 − 515,51 = 238,00; IRRF (6.800 − INSS 753,51 =
//   6.046,49 × 27,5% − 908,73 = 754,05; reduction 978,62 − 0,133145 × 6.800 = 73,23 → 680,82)
//   − 35,81 = 645,01 → net 816,99.
export const THIRTEENTH = SALARY;
export const VACATION_THIRD = { gross: 170_000, inss: 23_800, irrf: 64_501, net: 81_699 } as const;

/** PGDAS-D inference hypotheses for every PA (ENGINE-SPEC F.3, step 0). */
export const DAS_HYPOTHESES = {
  vNotSegregated: 892_500,
  vSegregated: 560_936,
  iiiNotSegregated: 528_000,
  iiiSegregated: 268_752,
} as const;

/** PF debits per month (ENGINE-SPEC F.2, "The partner's PF"). */
export const PF_DEBITS = {
  healthPlan: 65_000,
  psychologist: 80_000,
  gym: 12_990,
} as const;

// CNAE tables of ENGINE-SPEC E.4 (anexo and Fator R), E.5 (monofásico resale) and E.6 (health and education).
// Codes compared as 7 digits (subclass), whatever the formatting of the source.
import type { Anexo } from '@refund/engine';

export const cnaeDigits = (code: string | null | undefined): string =>
  (code ?? '').replace(/\D/g, '');

const matchAny = (digits: string, list: readonly string[]): boolean =>
  digits.length === 7 && list.some((p) => digits.startsWith(p));

export interface CnaeTaxProfile {
  subjectToFatorR: boolean;
  baseAnexo: Anexo;
  /** E.4 marks dentistry as "to be confirmed in the official table". */
  status: 'verified' | 'to_confirm';
  source: string;
}

/**
 * E.4, P0 personas only. The full Res. CGSN 140, Anexo VI table (`cnae-anexo.json`) arrives with E8; until then a
 * CNAE outside this list stops the analysis (CNAE_OUT_OF_SCOPE) instead of guessing an anexo (CLAUDE.md, rule 12).
 */
const E4: Record<string, CnaeTaxProfile> = {
  '6201501': {
    subjectToFatorR: true,
    baseAnexo: 'III',
    status: 'verified',
    source:
      'CNAE 6201-5/01: LC 123, art. 18, § 5º-D, IV (Anexo III; V abaixo do Fator R de 28%, § 5º-M)',
  },
  '6201502': {
    subjectToFatorR: true,
    baseAnexo: 'III',
    status: 'verified',
    source:
      'CNAE 6201-5/02: LC 123, art. 18, § 5º-D, IV (Anexo III; V abaixo do Fator R de 28%, § 5º-M)',
  },
  '8630504': {
    subjectToFatorR: true,
    baseAnexo: 'III',
    status: 'to_confirm',
    source: 'CNAE 8630-5/04: sujeito ao Fator R (ENGINE-SPEC E.4, a confirmar na tabela oficial)',
  },
  '4771701': {
    subjectToFatorR: false,
    baseAnexo: 'I',
    status: 'verified',
    source: 'CNAE 4771-7/01: Anexo I, sem Fator R (ENGINE-SPEC E.4)',
  },
};

export const cnaeTaxProfile = (code: string): CnaeTaxProfile | undefined => E4[cnaeDigits(code)];

/** E.5. Beverages (4723-7/00) stay switched off until the NCM check. */
const MONOFASICO = [
  '4771701',
  '4771702',
  '4771703',
  '4772500',
  '4530703',
  '4530705',
  '4731800',
  '4711301',
  '4711302',
  '4712100',
];
export const resellsMonofasico = (code: string): boolean => matchAny(cnaeDigits(code), MONOFASICO);

const HEALTH_DEDUCTIBLE = [
  '8610101',
  '8610102',
  '8621601',
  '8621602',
  '8630501',
  '8630502',
  '8630503',
  '8630504',
  '8630507',
  '864020', // 8640-2/01 to 8640-2/09
  '8640210',
  '8640211',
  '8640212',
  '8640213',
  '8650003',
  '8650004',
  '8650005',
  '8650006',
  '6550200',
];
const HEALTH_CONFIRM = [
  '8622400',
  '8630599',
  '8640214',
  '8640299',
  '8650007',
  '8690903',
  '4773300',
  '32507',
];
const HEALTH_NOT = [
  '8630506',
  '8650001',
  '8650002',
  '8650099',
  '8660700',
  '8690901',
  '8690902',
  '8690904',
  '8690999',
  '47717',
  '9313100',
];
const EDUCATION_DEDUCTIBLE = [
  '8511200',
  '8512100',
  '8513900',
  '8520100',
  '8531700',
  '8532500',
  '8533300',
  '8541400',
  '8542200',
];
const EDUCATION_NOT = ['8550301', '8550302', '8591100', '85929', '8593700', '85996'];

export type DeductionClass =
  | 'health_deductible'
  | 'health_confirm'
  | 'education_deductible'
  | 'not_deductible'
  | null;

/** E.6, by the payee's primary CNAE. */
export function deductionClass(code: string | null): DeductionClass {
  const d = cnaeDigits(code);
  if (matchAny(d, HEALTH_DEDUCTIBLE)) return 'health_deductible';
  if (matchAny(d, HEALTH_CONFIRM)) return 'health_confirm';
  if (matchAny(d, EDUCATION_DEDUCTIBLE)) return 'education_deductible';
  if (matchAny(d, HEALTH_NOT) || matchAny(d, EDUCATION_NOT)) return 'not_deductible';
  return null;
}

/** E.7: a school with a regular-schooling CNAE (E.6 education ✓) paid by the PJ is a personal expense. */
export const isRegularSchool = (code: string | null): boolean =>
  matchAny(cnaeDigits(code), EDUCATION_DEDUCTIBLE);

/** E.7: pharmacy on the PJ card is not personal for a health company (CNAE 86xx). */
export const isHealthCompany = (code: string): boolean => cnaeDigits(code).startsWith('86');

// CNAE tables of ENGINE-SPEC E.4 (anexo and Fator R), E.5 (monofásico resale) and E.6 (health and education).
// Codes compared as 7 digits (subclass), whatever the formatting of the source.
import { type Anexo, cnaeAnexoRow, cnaeInScope } from '@refund/engine';

export const cnaeDigits = (code: string | null | undefined): string =>
  (code ?? '').replace(/\D/g, '');

const matchAny = (digits: string, list: readonly string[]): boolean =>
  digits.length === 7 && list.some((p) => digits.startsWith(p));

export interface CnaeTaxProfile {
  subjectToFatorR: boolean;
  baseAnexo: Anexo;
  status: 'verified';
  source: string;
}

/** "6201501" or "6201-5/01" → "6201-5/01" (the engine table's key). */
const formatted = (code: string): string => {
  const d = cnaeDigits(code);
  return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}` : '';
};

/**
 * E.4 through the engine's table (`cnae-anexo.json`, every CNAE 2.3 subclass since D50). A CNAE the estimate can
 * compute (`cnaeInScope`, C.11.5 item 4) gets its anexo. Anything else (ambiguous, impeditive, Anexo II or IV, an
 * adjusted anexo) stops the analysis
 * (CNAE_OUT_OF_SCOPE) instead of guessing an anexo (CLAUDE.md, rule 12).
 */
export function cnaeTaxProfile(code: string): CnaeTaxProfile | undefined {
  const cnae = formatted(code);
  const row = cnaeAnexoRow(cnae);
  if (row === undefined || row.baseAnexo === null || !cnaeInScope(cnae)) return undefined;
  return {
    subjectToFatorR: row.subjectToFatorR,
    baseAnexo: row.baseAnexo,
    status: 'verified',
    source: `CNAE ${row.cnae}: ${row.source}`,
  };
}

/** E.5 through the same table: R06 triggers on a `true` row only; 'question' waits for the user's answer (D.6). */
export const resellsMonofasico = (code: string): boolean =>
  cnaeAnexoRow(formatted(code))?.resellsMonofasico === true;

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

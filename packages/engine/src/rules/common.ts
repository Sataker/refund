// Shared helpers of the rules: display formatting (user-visible, PT-BR) and the finding skeleton.
import type { Cents, Finding, YearMonth } from '../types.ts';

export const RULE_VERSION = '1.0.0';

/** 6231892 → "62.318,92" (Brazilian format, as the spec writes amounts). */
export function formatBrl(c: Cents | number): string {
  const negative = c < 0;
  const abs = Math.abs(c);
  const units = Math.floor(abs / 100);
  const decimals = String(abs % 100).padStart(2, '0');
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}${grouped},${decimals}`;
}

const MONTH_ABBR = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** '2027-04' → 'abr/2027' (D45, PLAN §18: the same month format the UI uses). */
export function formatMonth(m: YearMonth): string {
  const name = MONTH_ABBR[Number(m.slice(5, 7)) - 1];
  if (name === undefined) throw new RangeError(`invalid YearMonth: ${m}`);
  return `${name}/${m.slice(0, 4)}`;
}

/** `[step]` or `[]` (optional trace steps). */
export const nonNull = <T>(x: T | null): T[] => (x === null ? [] : [x]);

/** Order of each finding in the result (C.6: R01 → R05 → R06 → R04, then the findings outside the chain). */
export const ORDER_OF = {
  R01: 1,
  R05: 2,
  R06: 3,
  R04: 4,
  'R05-REC': 5,
  R02: 6,
  R03: 7,
  A01: 8,
  A02: 9,
} as const;

export type FindingBase = Pick<
  Finding,
  'ruleVersion' | 'actionPlan' | 'howToReceive' | 'assumptionsUsed'
>;

/**
 * Common fields of a finding. `actionPlan` and `howToReceive` start empty here and are filled by actions/build.ts
 * (C.12, stage E8b) once the combined scenario is done, so the rules never write a step.
 */
export const base = (): FindingBase => ({
  ruleVersion: RULE_VERSION,
  actionPlan: [],
  howToReceive: [],
  assumptionsUsed: [],
});

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

/** '2027-04' → '04/2027'. */
export const formatMonth = (m: YearMonth): string => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

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
 * The action plan (C.12) has no stage in EXECUTION E5/E8; its texts come only from `@refund/law` metadata with a
 * primary source. Until it is specified in a stage, findings carry empty lists (EXECUTION §9, E5).
 */
export const base = (): FindingBase => ({
  ruleVersion: RULE_VERSION,
  actionPlan: [],
  howToReceive: [],
  assumptionsUsed: [],
});

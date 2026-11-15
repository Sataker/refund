// Parameter lookup by effective period (ENGINE-SPEC C.1, item 4).
import { EngineError } from '../errors.ts';
import { compareYearMonth } from '../time.ts';
import type { LegalRef, YearMonth } from '../types.ts';
import { PARAMETERS_2026 } from './2026.ts';
import { PARAMETERS_2027 } from './2027.ts';
import { parameterRef } from './legal-refs.ts';
import type { AnyParameterEntry, ParameterEntry, ParameterKey, ParameterLookup } from './types.ts';

export type * from './types.ts';

/** Version of the official parameter set (bumped whenever a value or status changes). */
export const PARAMETERS_VERSION = '2026.11.14';

export const OFFICIAL_SET_ID = 'official';

export const parameterSets: { id: string; label: string; simulation: boolean }[] = [
  { id: OFFICIAL_SET_ID, label: 'Parâmetros oficiais 2026–2027', simulation: false },
];

export const ALL_PARAMETERS: readonly AnyParameterEntry[] = [
  ...PARAMETERS_2026,
  ...PARAMETERS_2027,
];

/**
 * Last record of `key` in force in `month`. `projected: true` when the month is after the last published one
 * (e.g. the 2027 IR table): the trace then says "parâmetro de 2027 ainda não publicado; usado o de 2026".
 */
export function param<K extends ParameterKey>(key: K, month: YearMonth): ParameterLookup<K> {
  // The parameter tables are constants, so a lookup is a pure function of (key, month): memoized for the slider
  // recalculation budget (ARCHITECTURE §11.1) and the profile grid (C.11.8).
  const memoKey = `${key}|${month}`;
  const hit = LOOKUPS.get(memoKey);
  if (hit !== undefined) return hit as ParameterLookup<K>;
  const lookup = lookupParam(key, month);
  LOOKUPS.set(memoKey, lookup);
  return lookup;
}

const LOOKUPS = new Map<string, ParameterLookup<ParameterKey>>();

function lookupParam<K extends ParameterKey>(key: K, month: YearMonth): ParameterLookup<K> {
  let found: ParameterEntry<K> | undefined;
  for (const entry of ALL_PARAMETERS) {
    if (entry.key !== key) continue;
    if (compareYearMonth(entry.effectiveFrom, month) > 0) continue;
    if (found === undefined || compareYearMonth(entry.effectiveFrom, found.effectiveFrom) > 0) {
      found = entry as ParameterEntry<K>;
    }
  }
  if (found === undefined) {
    throw new EngineError('PARAMETER_NOT_IN_FORCE', `no parameter '${key}' in force in ${month}`, {
      key,
      month,
    });
  }
  return {
    key,
    value: found.value,
    source: found.source,
    effectiveFrom: found.effectiveFrom,
    verifiedAt: found.verifiedAt,
    status: found.status,
    projected:
      found.publishedThrough !== undefined && compareYearMonth(month, found.publishedThrough) > 0,
    dependsOnRegulation: found.dependsOnRegulation === true,
  };
}

/** Same as `param`, but null when the key has no record in force in `month` (e.g. a regime born later). */
export function paramOrNull<K extends ParameterKey>(
  key: K,
  month: YearMonth,
): ParameterLookup<K> | null {
  const inForce = ALL_PARAMETERS.some(
    (e) => e.key === key && compareYearMonth(e.effectiveFrom, month) <= 0,
  );
  return inForce ? param(key, month) : null;
}

/**
 * LegalRef of a parameter record, used by the trace steps (C.10): a provision of @refund/law or a captured non-law
 * source (`legal-refs.ts`); undefined when the record's source was not captured (never a made-up id, CLAUDE.md rule 3).
 */
export function legalRefOf(lookup: {
  key: ParameterKey;
  effectiveFrom: YearMonth;
}): LegalRef | undefined {
  return parameterRef(lookup.key, lookup.effectiveFrom);
}

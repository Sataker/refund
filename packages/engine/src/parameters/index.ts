// Parameter lookup by effective period (ENGINE-SPEC C.1, item 4).
import { compareYearMonth } from '../time.ts';
import type { LegalRef, YearMonth } from '../types.ts';
import { PARAMETERS_2026 } from './2026.ts';
import { PARAMETERS_2027 } from './2027.ts';
import type {
  AnyParameterEntry,
  ParameterEntry,
  ParameterKey,
  ParameterLookup,
  ParameterSource,
} from './types.ts';

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
  let found: ParameterEntry<K> | undefined;
  for (const entry of ALL_PARAMETERS) {
    if (entry.key !== key) continue;
    if (compareYearMonth(entry.effectiveFrom, month) > 0) continue;
    if (found === undefined || compareYearMonth(entry.effectiveFrom, found.effectiveFrom) > 0) {
      found = entry as ParameterEntry<K>;
    }
  }
  if (found === undefined) {
    throw new RangeError(`no parameter '${key}' in force in ${month}`);
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

const slug = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/§+/g, 'par')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * LegalRef of a parameter, used by the trace steps (C.10). The id convention `<regulation>#<provision>` (slugs) is
 * provisional: E8 checks every engine ref against @refund/law and aligns it with the corpus id convention.
 */
export function legalRefOf(lookup: {
  source: ParameterSource;
  verifiedAt: LegalRef['verifiedAt'];
}): LegalRef {
  const { regulation, provision, url } = lookup.source;
  return {
    id: `${slug(regulation)}#${slug(provision)}`,
    label: `${regulation}, ${provision}`,
    url,
    verifiedAt: lookup.verifiedAt,
    type: 'regulation',
  };
}

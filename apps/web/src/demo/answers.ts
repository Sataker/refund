import type { ProfileAnswers, RevenueBracket } from '@refund/engine';

// First-access track answers on /demo (ARCHITECTURE §13: "the answers stay in the URL and in sessionStorage,
// no database"). Browser-safe: types only from the engine, no persona data. Query keys are code (GLOSSARY §10).

export const REVENUE_VALUES: readonly RevenueBracket[] = [
  'up_to_15k',
  'from_15k_to_30k',
  'from_30k_to_60k',
  'from_60k_to_150k',
  'from_150k_to_300k',
  'from_300k_to_400k',
  'above_400k',
  'dont_know',
];
export const EMPLOYEE_VALUES: readonly ProfileAnswers['hasEmployees'][] = [
  'yes',
  'no',
  'dont_know',
];
export const ABROAD_VALUES: readonly ProfileAnswers['receivesFromAbroad'][] = [
  'no',
  'less_than_half',
  'half_or_more',
  'dont_know',
];

export interface DemoTrackState {
  answers: ProfileAnswers;
  /** "Pular: só a PJ" on the conta-pf step. */
  pfSkipped: boolean;
}

export function answersKey(a: ProfileAnswers): string {
  return `${a.monthlyRevenueBracket}|${a.hasEmployees}|${a.receivesFromAbroad}`;
}

/** C.11.1: a question that is not asked for this CNAE is answered `dont_know`. */
export function effectiveAnswers(
  a: ProfileAnswers,
  questions: { employees: boolean; abroad: boolean },
): ProfileAnswers {
  return {
    monthlyRevenueBracket: a.monthlyRevenueBracket,
    hasEmployees: questions.employees ? a.hasEmployees : 'dont_know',
    receivesFromAbroad: questions.abroad ? a.receivesFromAbroad : 'dont_know',
  };
}

const pick = <T extends string>(values: readonly T[], v: string | null): T | undefined =>
  values.find((x) => x === v);

/** Reads what the URL carries; anything unknown is ignored (the persona's answer stays). */
export function fromQuery(search: string, base: DemoTrackState): DemoTrackState {
  const q = new URLSearchParams(search);
  return {
    answers: {
      monthlyRevenueBracket:
        pick(REVENUE_VALUES, q.get('revenue')) ?? base.answers.monthlyRevenueBracket,
      hasEmployees: pick(EMPLOYEE_VALUES, q.get('employees')) ?? base.answers.hasEmployees,
      receivesFromAbroad: pick(ABROAD_VALUES, q.get('abroad')) ?? base.answers.receivesFromAbroad,
    },
    pfSkipped: q.has('pf') ? q.get('pf') === 'skip' : base.pfSkipped,
  };
}

export function toQuery(s: DemoTrackState): string {
  const q = new URLSearchParams({
    revenue: s.answers.monthlyRevenueBracket,
    employees: s.answers.hasEmployees,
    abroad: s.answers.receivesFromAbroad,
  });
  if (s.pfSkipped) q.set('pf', 'skip');
  return q.toString();
}

export const trackStorageKey = (persona: string) => `refund:demo:track:${persona}`;

/** sessionStorage can be missing or throw (private mode, blocked storage): the persona's answers stay. */
export function loadTrack(persona: string, base: DemoTrackState): DemoTrackState {
  try {
    const raw = window.sessionStorage.getItem(trackStorageKey(persona));
    if (raw === null) return base;
    const v = JSON.parse(raw) as Partial<Record<string, string | boolean>>;
    const q = new URLSearchParams();
    for (const k of ['revenue', 'employees', 'abroad'] as const) {
      const x = v[k];
      if (typeof x === 'string') q.set(k, x);
    }
    if (v.pfSkipped === true) q.set('pf', 'skip');
    return fromQuery(q.toString(), base);
  } catch {
    return base;
  }
}

export function saveTrack(persona: string, s: DemoTrackState): void {
  try {
    window.sessionStorage.setItem(
      trackStorageKey(persona),
      JSON.stringify({
        revenue: s.answers.monthlyRevenueBracket,
        employees: s.answers.hasEmployees,
        abroad: s.answers.receivesFromAbroad,
        pfSkipped: s.pfSkipped,
      }),
    );
  } catch {
    // Storage unavailable: the URL still carries the answers.
  }
}

export function clearTrack(persona: string): void {
  try {
    window.sessionStorage.removeItem(trackStorageKey(persona));
  } catch {
    // Nothing stored.
  }
}

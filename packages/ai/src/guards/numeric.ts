// Numeric guard (ARCHITECTURE §4.5, REVISAO M6): every monetary value and percentage in a model text must exist in
// the finding's trace. Rule 1: the AI does not calculate, so a number the trace does not hold is an invention.
import type { Finding, Trace } from '@refund/engine';
import {
  asInteger,
  atPrecision,
  type Exact,
  fold,
  NUM,
  parseMachine,
  parsePtBr,
  shift,
} from './ptbr.ts';

export interface NumericGuardResult {
  ok: boolean;
  /** The text excerpts whose value is not in the trace (as written). */
  outsideTrace: string[];
}

/** What a text may mention: amounts in cents and rates as exact fractions (0,28 = 28%). */
export interface NumericAllowance {
  cents: number[];
  rates: Exact[];
}

const SCALE = String.raw`(?:mil|mi|milh(?:ão|ao|ões|oes)|bi|bilh(?:ão|ao|ões|oes))(?![\p{L}])`;

// One pass, left to right; the alternatives are tried in this order at each position, so "R$ 41,6 mil" is one
// mention and never also "41,6 mil". Numbers start at a digit boundary ("x.111,70" is not "111,70").
const B = String.raw`(?<![\d.,])`;
const MENTION = new RegExp(
  [
    String.raw`R\$\s*(?<pnum>${NUM})(?:\s*(?<pscale>${SCALE}))?`,
    String.raw`${B}(?<snum>${NUM})\s*(?:(?<sscale>${SCALE})\s*)?(?:de\s+)?reais(?![\p{L}])`,
    String.raw`${B}(?<pct>${NUM})\s*(?:%|por\s+cento(?![\p{L}])|p\.\s?p\.)`,
    String.raw`${B}(?<bnum>${NUM})\s*(?<bscale>${SCALE})`,
    // A bare amount with centavos ("9.000,00") is money even without "R$".
    String.raw`${B}(?<dec>\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?![\d%])`,
  ].join('|'),
  'giu',
);

/** Words that announce display rounding ("cerca de R$ 41 mil"). */
const APPROX =
  /(?:cerca de|aproximadamente|quase|em torno de|perto de|por volta de|uns|umas|~)\s*$/;

/** A mention whose number is too long to read exactly has `null` and never passes. */
type Mention =
  | { kind: 'money'; raw: string; cents: Exact | null; wholeUnits: boolean; approx: boolean }
  | { kind: 'percent'; raw: string; pct: Exact | null };

/** mil = 10³, mi/milhão = 10⁶, bi/bilhão = 10⁹. */
function scaleExp(word: string | undefined): number {
  if (word === undefined) return 0;
  const w = fold(word);
  if (w === 'mil') return 3;
  return w.startsWith('bi') ? 9 : 6;
}

/** Monetary values and percentages in a PT-BR text; everything else (articles, years, counts) is ignored. */
export function mentions(text: string): Mention[] {
  const out: Mention[] = [];
  for (const m of text.matchAll(MENTION)) {
    const g = m.groups as Record<string, string | undefined>;
    const raw = m[0].trim();
    if (g.pct !== undefined) {
      out.push({ kind: 'percent', raw, pct: parsePtBr(g.pct) });
      continue;
    }
    const value = parsePtBr(String(g.pnum ?? g.snum ?? g.bnum ?? g.dec));
    const exp = scaleExp(g.pscale ?? g.sscale ?? g.bscale);
    const before = fold(text.slice(Math.max(0, m.index - 24), m.index));
    out.push({
      kind: 'money',
      raw,
      cents: value === null ? null : shift(value, 2 + exp),
      wholeUnits: exp === 0 && value?.scale === 0,
      approx: exp > 0 || APPROX.test(before),
    });
  }
  return out;
}

// Bare decimals in the engine's own strings ("(0,28 + folga) × RBT12") are rates.
const BARE_DECIMAL = /(?<![\d.,])\d+,\d+(?![\d%])/g;

/** Amounts and rates written inside engine strings (trace labels and formulas, the finding's headline). */
export function allowanceFromText(text: string): NumericAllowance {
  const cents: number[] = [];
  const rates: Exact[] = [];
  for (const m of mentions(text)) {
    if (m.kind === 'percent') {
      if (m.pct !== null) rates.push({ mantissa: m.pct.mantissa, scale: m.pct.scale + 2 });
    } else {
      const c = m.cents === null ? null : asInteger(m.cents);
      if (c !== null) cents.push(c);
    }
  }
  for (const m of text.matchAll(BARE_DECIMAL)) {
    const r = parsePtBr(m[0]);
    if (r !== null) rates.push(r);
  }
  return { cents, rates };
}

/** Every value the trace holds: inputs and results (cents, rates, numeric text) and the numbers in its strings. */
export function allowanceFromTrace(trace: Trace): NumericAllowance {
  const cents: number[] = [];
  const rates: Exact[] = [];
  const add = (a: NumericAllowance) => {
    cents.push(...a.cents);
    rates.push(...a.rates);
  };
  const value = (v: { value: number | string; unit: string }) => {
    if (v.unit === 'cents' && typeof v.value === 'number') cents.push(Math.abs(v.value));
    else if (v.unit === 'rate' || v.unit === 'text') {
      const r = parseMachine(v.value);
      if (r !== null) rates.push({ mantissa: Math.abs(r.mantissa), scale: r.scale });
      else add(allowanceFromText(String(v.value)));
    }
  };
  for (const step of trace) {
    for (const input of Object.values(step.inputs)) value(input);
    value(step.result);
    add(allowanceFromText(`${step.label} ${step.formula} ${step.projectedNote ?? ''}`));
  }
  return { cents, rates };
}

function moneyAllowed(
  cents: Exact,
  m: { wholeUnits: boolean; approx: boolean },
  allowed: number[],
) {
  const exact = asInteger(cents);
  const approxValue = cents.mantissa / 10 ** cents.scale;
  return allowed.some((a) => {
    if (exact === a) return true;
    // "R$ 28.316" for 2.831.652 cents: whole reais, rounded or truncated.
    if (m.wholeUnits && exact !== null && Math.abs(a - exact) < 100) return true;
    // "R$ 41,6 mil" or "cerca de R$ 41 mil": display rounding below 0,5% (ARCHITECTURE §4.5).
    return m.approx && Math.abs(a - approxValue) < 0.005 * a;
  });
}

function percentAllowed(pct: Exact, rates: Exact[]): boolean {
  // A rate r shows as r × 100 with as many decimals as the text wrote, truncated or rounded half-up.
  return rates.some((r) => {
    const { trunc, round } = atPrecision(shift(r, 2), pct.scale);
    return trunc === pct.mantissa || round === pct.mantissa;
  });
}

const allowedMention = (m: Mention, allowed: NumericAllowance): boolean => {
  if (m.kind === 'percent') return m.pct !== null && percentAllowed(m.pct, allowed.rates);
  return m.cents !== null && moneyAllowed(m.cents, m, allowed.cents);
};

export function checkNumbers(text: string, allowed: NumericAllowance): NumericGuardResult {
  const outsideTrace = mentions(text)
    .filter((m) => !allowedMention(m, allowed))
    .map((m) => m.raw);
  return { ok: outsideTrace.length === 0, outsideTrace };
}

/** ARCHITECTURE §4.5 signature: the trace plus extra amounts in cents. */
export function numericGuard(
  text: string,
  trace: Trace,
  extras: number[] = [],
): NumericGuardResult {
  const allowed = allowanceFromTrace(trace);
  allowed.cents.push(...extras.map(Math.abs));
  return checkNumbers(text, allowed);
}

/**
 * The guard as the port applies it: the trace, the finding's own amounts (marginal, steady state, range, recovery
 * split) and the amounts of its headline, which the engine wrote (R02's "R$ 50 mil por mês" is not in its trace;
 * EXECUTION §9, E10).
 */
export function findingNumericGuard(text: string, finding: Finding): NumericGuardResult {
  const allowed = allowanceFromTrace(finding.trace);
  const fromTitle = allowanceFromText(finding.title);
  allowed.cents.push(
    finding.marginalValue12m,
    ...(finding.annualRegimeValue === undefined ? [] : [finding.annualRegimeValue]),
    ...(finding.range ?? []),
    ...Object.values(finding.byDestination ?? {}).flat(),
    ...fromTitle.cents,
  );
  allowed.rates.push(...fromTitle.rates);
  allowed.cents = allowed.cents.map(Math.abs);
  return checkNumbers(text, allowed);
}

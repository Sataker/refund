// Numeric guard (ARCHITECTURE §4.5, REVISAO M6): every monetary value and percentage in a model text must exist in
// the finding's trace. Rule 1: the AI does not calculate, so a number the trace does not hold is an invention.
//
// Fail closed (code review 16/11): the text is NFKC-normalized; every digit run is read and must be either a known
// harmless number (year, date, CNAE, a count below 100 or followed by a count noun, a number inside a legal citation)
// or a value the trace holds. Non-ASCII digits, foreign currencies, fractions ("1/3", "metade") and number words next
// to money or percent fail outright.
import type { Finding, Trace } from '@refund/engine';
import { citationSpans, normalize } from './citation.ts';
import {
  asInteger,
  atPrecision,
  type Exact,
  fold,
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

/** A digit sequence read from the text. `value` is null when it is not a well-formed PT-BR number. */
export type Mention =
  | { kind: 'money'; raw: string; value: Exact | null; exp: number; approx: boolean }
  | { kind: 'percent'; raw: string; value: Exact | null }
  /** No unit: a grouped or decimal number ("28.316,52", "0,28"); passes as an amount or as a rate. */
  | { kind: 'bare'; raw: string; value: Exact | null }
  /** Always outside the trace: foreign currency, non-ASCII digits, fractions, number words, an unexplained count. */
  | { kind: 'invalid'; raw: string };

const NUMBER = /(?<!\d)\d+(?:[.,]\d+)*/g;
const PTBR = /^(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)$/;
const NON_ASCII_DIGITS = /(?![0-9])\p{Nd}+/gu;

// Spans whose digits are not amounts: dates (23/11/2026, 04/2027, 2027-04-01), CNAE (6201-5/01), "/2018" years.
const IGNORED = [
  /(?<![\d/])(?:\d{1,2}\/)?\d{1,2}\/\d{4}(?![\d/])/g,
  /(?<!\d)\d{4}-\d{2}(?:-\d{2})?(?!\d)/g,
  /(?<!\d)\d{4}-\d\/\d{2}(?!\d)/g,
  /\/\d{4}(?!\d)/g,
];

// Matched against folded (lower-case, accent-free) slices around the number.
const CURRENCY_BEFORE = /(r\s?\$|brl|us\s?\$|u\$s|usd|eur|€|£|\$)\s*-?\s*$/;
const BRL = /^(?:r\s?\$|brl)$/;
const SCALE_AFTER = /^\s*(mil|mi|milh(?:ao|oes)|bi|bilh(?:ao|oes)|k)(?![\p{L}])/u;
const REAIS_AFTER = /^\s*(?:de\s+)?(?:reais|real|brl)(?![\p{L}])/u;
const PERCENT_AFTER =
  /^\s*(?:%|por\s*cento(?![\p{L}])|porcento(?![\p{L}])|pontos?\s+percentua(?:l|is)(?![\p{L}])|p\.\s?p\.?|pp(?![\p{L}]))/u;
const RANGE_AFTER = /^\s*(?:e|a|ou|ate|-|–)\s*\d[\d.,]*/u;
const COUNT_AFTER =
  /^\s*(?:mes|meses|anos?|dias?|semanas?|transac\w*|lancament\w*|funcionari\w*|empregad\w*|parcelas?|pagamentos?|pas|vezes|clientes?|notas?|itens?|regras?|achados?|socios?|contas?|cartoes?|horas?)(?![\p{L}])/u;
/** Words that announce display rounding ("cerca de R$ 41 mil"). */
const APPROX =
  /(?:cerca de|aproximadamente|quase|em torno de|perto de|por volta de|uns|umas|~)\s*(?:r\s?\$\s*)?$/;

const WORD = String.raw`(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|milhao|milhoes|bilhao|bilhoes)`;
const NUMBER_WORDS = new RegExp(
  String.raw`(?<![\p{L}])${WORD}(?:\s+(?:e\s+)?${WORD})*(?![\p{L}])`,
  'gu',
);
const SCALE_WORD = /(?<![\p{L}])(?:mil|milh|bilh)/u;
const FRACTION_WORDS =
  /(?<![\p{L}])(?:metade|dobro|triplo|quadruplo|tercos?|quintuplo)(?![\p{L}])/gu;

/** mil = 10³, mi/milhão and k… (k = 10³), bi/bilhão = 10⁹. */
function scaleExp(word: string): number {
  if (word === 'mil' || word === 'k') return 3;
  return word.startsWith('bi') ? 9 : 6;
}

const inside = (spans: [number, number][], s: number, e: number) =>
  spans.some(([a, b]) => s >= a && e <= b);

/** Every number in a PT-BR text, classified; see `Mention`. */
export function mentions(raw: string): Mention[] {
  const text = normalize(raw);
  const out: Mention[] = [];
  for (const m of text.matchAll(NON_ASCII_DIGITS)) out.push({ kind: 'invalid', raw: m[0] });

  const folded = fold(text);
  for (const m of folded.matchAll(FRACTION_WORDS)) out.push({ kind: 'invalid', raw: m[0] });
  for (const m of folded.matchAll(NUMBER_WORDS)) {
    const before = folded.slice(Math.max(0, m.index - 8), m.index);
    // "41,6 mil": the word is the scale of a numeral, read with the number below.
    if (/\d[\d.,]*\s*$/.test(before) && /^(?:mil|milh|bilh)/.test(m[0])) continue;
    const after = folded.slice(m.index + m[0].length, m.index + m[0].length + 30);
    const money =
      SCALE_WORD.test(m[0]) ||
      CURRENCY_BEFORE.test(before) ||
      REAIS_AFTER.test(after) ||
      PERCENT_AFTER.test(after);
    if (money) out.push({ kind: 'invalid', raw: m[0] });
  }

  const skip: [number, number][] = [
    ...citationSpans(text),
    ...IGNORED.flatMap((re) =>
      [...text.matchAll(re)].map((m): [number, number] => [m.index, m.index + m[0].length]),
    ),
  ];
  for (const m of text.matchAll(NUMBER)) {
    const s = m.index;
    const e = s + m[0].length;
    if (inside(skip, s, e)) continue;
    const before = fold(text.slice(Math.max(0, s - 16), s));
    const after = fold(text.slice(e, e + 40));
    // "1/3", "23/11": a slash that is no date, law number or CNAE is a fraction or an unknown reference.
    if (text[e] === '/' || text[s - 1] === '/') {
      out.push({ kind: 'invalid', raw: m[0] });
      continue;
    }
    const value = PTBR.test(m[0]) ? parsePtBr(m[0]) : null;
    const currency = CURRENCY_BEFORE.exec(before);
    if (currency !== null && !BRL.test(String(currency[1]))) {
      out.push({ kind: 'invalid', raw: `${currency[1]} ${m[0]}` });
      continue;
    }
    // "30 e 50 mil reais": the first number takes the unit of the second.
    const range = RANGE_AFTER.exec(after);
    const unitText = range === null ? after : after.slice(range[0].length).replace(/^[.,]?\s*/, '');
    const percent = PERCENT_AFTER.exec(after) ?? (range ? PERCENT_AFTER.exec(unitText) : null);
    if (percent !== null) {
      out.push({ kind: 'percent', raw: `${m[0]}${percent[0]}`.trim(), value });
      continue;
    }
    const scale = SCALE_AFTER.exec(after) ?? (range ? SCALE_AFTER.exec(unitText) : null);
    const reais = REAIS_AFTER.test(after) || (range !== null && REAIS_AFTER.test(unitText));
    const rawText = `${currency ? `${String(currency[1]).toUpperCase()} ` : ''}${m[0]}${scale ? scale[0] : ''}`;
    if (currency !== null || scale !== null || reais) {
      out.push({
        kind: 'money',
        raw: rawText.trim(),
        value,
        exp: scale === null ? 0 : scaleExp(String(scale[1])),
        approx: APPROX.test(before),
      });
      continue;
    }
    if (value === null) {
      out.push({ kind: 'invalid', raw: m[0] });
      continue;
    }
    const plainInteger = /^\d+$/.test(m[0]);
    const groupedInteger = /^\d{1,3}(?:\.\d{3})+$/.test(m[0]);
    if ((plainInteger || groupedInteger) && COUNT_AFTER.test(after)) continue;
    if (plainInteger) {
      const n = Number(m[0]);
      // Years and small counts ("12 meses", "2 ×", "10 meses parado") carry no amount.
      if (n < 100 || (m[0].length === 4 && n >= 1900 && n <= 2099)) continue;
      out.push({ kind: 'invalid', raw: m[0] });
      continue;
    }
    out.push({ kind: 'bare', raw: m[0], value });
  }
  return out;
}

// Bare decimals in the engine's own strings ("(0,28 + folga) × RBT12") are rates.
const BARE_DECIMAL = /(?<![\d.,])\d+,\d+(?![\d%])/g;

/** An amount written with `value` at 10^exp reais, in cents, when it is a whole number of cents. */
function centsOf(value: Exact, exp: number): number | null {
  return asInteger(shift(value, 2 + exp));
}

/** Amounts and rates written inside engine strings (trace labels and formulas, the finding's headline). */
export function allowanceFromText(text: string): NumericAllowance {
  const cents: number[] = [];
  const rates: Exact[] = [];
  for (const m of mentions(text)) {
    if (m.kind === 'invalid' || m.value === null) continue;
    if (m.kind === 'percent') rates.push({ mantissa: m.value.mantissa, scale: m.value.scale + 2 });
    else {
      const c = centsOf(m.value, m.kind === 'money' ? m.exp : 0);
      if (c !== null) cents.push(c);
    }
  }
  for (const m of normalize(text).matchAll(BARE_DECIMAL)) {
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
      if (r !== null) rates.push(r);
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

/**
 * An amount shown at a precision: the last digit written is worth U cents (U = 10^(exp − decimals + 2)). Whole reais
 * may truncate or round ("R$ 28.316" for 28.316,52); "mil"/"mi" values must round ("R$ 41,6 mil" for 41.632,17);
 * "cerca de R$ 41.600" may round at its trailing zeros. Finer than a cent must be exact.
 */
function moneyAllowed(value: Exact, exp: number, approx: boolean, allowed: number[]): boolean {
  let mantissa = value.mantissa;
  let unitExp = exp - value.scale + 2;
  if (approx && exp === 0 && value.scale === 0) {
    while (mantissa > 0 && mantissa % 10 === 0) {
      mantissa /= 10;
      unitExp++;
    }
  }
  return allowed.some((a) => {
    if (unitExp < 0) return a * 10 ** -unitExp === mantissa;
    const u = 10 ** unitExp;
    const trunc = Math.trunc(a / u);
    const round = Math.trunc((a + u / 2) / u);
    return (
      round === mantissa || (unitExp === 2 && trunc === mantissa) || (u === 1 && a === mantissa)
    );
  });
}

/** A rate r shows as r × 100 with as many decimals as the text wrote, truncated or rounded half-up. */
function rateAllowed(shown: Exact, rates: Exact[], asPercent: boolean): boolean {
  return rates.some((r) => {
    const { trunc, round } = atPrecision(asPercent ? shift(r, 2) : r, shown.scale);
    return trunc === shown.mantissa || round === shown.mantissa;
  });
}

function allowedMention(m: Mention, allowed: NumericAllowance): boolean {
  if (m.kind === 'invalid' || m.value === null) return false;
  if (m.kind === 'percent') return rateAllowed(m.value, allowed.rates, true);
  if (m.kind === 'money') return moneyAllowed(m.value, m.exp, m.approx, allowed.cents);
  return (
    moneyAllowed(m.value, 0, false, allowed.cents) || rateAllowed(m.value, allowed.rates, false)
  );
}

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

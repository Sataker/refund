// Editable assumptions (ENGINE-SPEC C.2 `Assumptions`; ARCHITECTURE §4.2: the keys of `Facts.assumptions` are the
// keys of `Assumptions`, an unknown key is a validation error). Defaults: C.2, C.4, D.2 and F.2.
import { EngineError } from './errors.ts';
import { rate } from './money.ts';
import { addMonths, monthOfDate, yearMonth } from './time.ts';
import { type Assumptions, type Cents, cents, type Facts, type Rate } from './types.ts';

const KEYS: readonly (keyof Assumptions)[] = [
  'start',
  'horizonMonths',
  'fatorRMargin',
  'revenueProjection',
  'payrollProjection',
  'selicAnnual',
  'dividendRefundMonth',
  'pgblRedemptionRate',
  'monofasicoPct',
  'r01Threshold',
];

/** Resolved assumptions. `selicAnnual` has no default (SGS 432 or fixture): without it R02 has no financial cost. */
export type ResolvedAssumptions = Omit<Assumptions, 'selicAnnual'> & { selicAnnual?: Rate };

const invalid = (key: string, value: unknown): EngineError =>
  new EngineError('INVALID_ASSUMPTION', `invalid assumption ${key}: ${JSON.stringify(value)}`, {
    key,
  });

function asRate(key: string, v: unknown): Rate {
  const s = typeof v === 'number' ? String(v) : v;
  if (typeof s !== 'string') throw invalid(key, v);
  try {
    return rate(s);
  } catch {
    throw invalid(key, v);
  }
}

function asMonth(key: string, v: unknown) {
  if (typeof v !== 'string') throw invalid(key, v);
  try {
    return yearMonth(v);
  } catch {
    throw invalid(key, v);
  }
}

/** Facts.assumptions → Assumptions with the defaults. Throws EngineError (caught by analyze). */
export function resolveAssumptions(facts: Facts): ResolvedAssumptions {
  const analysisMonth = monthOfDate(facts.analysisDate);
  const out: ResolvedAssumptions = {
    start: addMonths(analysisMonth, 1), // C.4: month after the analysis
    horizonMonths: 12,
    fatorRMargin: rate('0.01'), // D13
    revenueProjection: 'avg12',
    payrollProjection: 'sameMonthPriorYear',
    // D.2: default 2027-06 for an analysis in 2026 (refund in the DIRPF of the following year, first batches).
    dividendRefundMonth: yearMonth(`${Number(analysisMonth.slice(0, 4)) + 1}-06`),
    pgblRedemptionRate: rate('0.10'), // D9; Lei 11.053/2004, art. 1º, VI
    r01Threshold: { absoluteMinimum: cents(300000), rbt12Percentage: rate('0.01') }, // D14
  };
  for (const [key, entry] of Object.entries(facts.assumptions)) {
    if (!(KEYS as readonly string[]).includes(key)) {
      throw new EngineError('UNKNOWN_ASSUMPTION', `unknown assumption: ${key}`, { key });
    }
    const v = entry.value;
    switch (key as keyof Assumptions) {
      case 'start':
        out.start = asMonth(key, v);
        break;
      case 'dividendRefundMonth':
        out.dividendRefundMonth = asMonth(key, v);
        break;
      case 'horizonMonths':
        if (v !== 12) throw invalid(key, v); // fixed in P0
        break;
      case 'revenueProjection':
        if (v !== 'avg12') throw invalid(key, v);
        break;
      case 'payrollProjection':
        if (v !== 'sameMonthPriorYear') throw invalid(key, v);
        break;
      case 'fatorRMargin':
        out.fatorRMargin = asRate(key, v);
        break;
      case 'selicAnnual':
        out.selicAnnual = asRate(key, v);
        break;
      case 'pgblRedemptionRate':
        out.pgblRedemptionRate = asRate(key, v);
        break;
      case 'monofasicoPct':
        out.monofasicoPct = asRate(key, v);
        break;
      case 'r01Threshold': {
        if (typeof v !== 'object' || v === null) throw invalid(key, v);
        const r = v as Record<string, number | string>;
        const min = r.absoluteMinimum;
        if (typeof min !== 'number' || !Number.isSafeInteger(min) || min < 0) throw invalid(key, v);
        out.r01Threshold = {
          absoluteMinimum: cents(min) as Cents,
          rbt12Percentage: asRate(key, r.rbt12Percentage),
        };
        break;
      }
    }
  }
  return out;
}

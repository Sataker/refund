// PGDAS-D inference from the DAS paid (ENGINE-SPEC C.3.7): in which anexo and with which segregation the accountant
// filed each PA, read from the bank statement without asking the accountant.
import { D, reais, roundToCents } from './money.ts';
import type { Ctx } from './projection.ts';
import { currentProLabore } from './projection.ts';
import { formatMonth } from './rules/common.ts';
import { dasUnder, paInputs } from './scenario.ts';
import { step } from './trace.ts';
import type { Anexo, Cents, DasPayment, Step, YearMonth } from './types.ts';

export interface PgdasHypothesis {
  anexo: Anexo;
  segregated: boolean;
}

export interface PaInference {
  pa: YearMonth;
  paid: DasPayment;
  expected: { hypothesis: PgdasHypothesis; das: Cents }[];
  /** The single hypothesis within the tolerance, or null ('unknown'). */
  match: PgdasHypothesis | null;
}

export interface PgdasInference {
  byPa: PaInference[];
  /** C.3.7 aggregation: 'no' if ≥ 10 PAs match "did not segregate"; 'yes' if ≥ 10 match "segregated" (§9, E5). */
  segregates: 'yes' | 'no' | 'unknown';
  matchedNotSegregated: number;
  matchedSegregated: number;
  steps: Step[];
}

const MIN_MATCHES = 10;

/** |paid − expected| ≤ max(R$ 1,00; 0,1% × expected) (C.3.7). */
function withinTolerance(paid: Cents, expected: Cents): boolean {
  const tolerance = Math.max(100, roundToCents(reais(expected).times(D('0.001'))));
  return Math.abs(paid - expected) <= tolerance;
}

export function inferPgdasForPa(ctx: Ctx, paid: DasPayment): PaInference {
  const company = ctx.facts.companyDetails.value;
  const anexos: Anexo[] = company.subjectToFatorR ? ['III', 'V'] : [company.baseAnexo];
  // The PAs before `start` are the current situation: observed pró-labore, P0 outside the statement.
  const inputs = paInputs(ctx, paid.pa, (m) => currentProLabore(ctx, m));
  const expected: PaInference['expected'] = [];
  for (const anexo of anexos) {
    for (const segregated of [false, true]) {
      const das = dasUnder(ctx, paid.pa, inputs, anexo, segregated).das;
      expected.push({ hypothesis: { anexo, segregated }, das });
    }
  }
  const matches = expected.filter((e) => withinTolerance(paid.amount, e.das));
  return {
    pa: paid.pa,
    paid,
    expected,
    match: matches.length === 1 ? (matches[0]?.hypothesis ?? null) : null,
  };
}

export function inferPgdas(ctx: Ctx): PgdasInference {
  const byPa = [...ctx.facts.dasPaid.value]
    .sort((a, b) => (a.pa < b.pa ? -1 : a.pa > b.pa ? 1 : 0))
    .map((p) => inferPgdasForPa(ctx, p));
  const matchedNotSegregated = byPa.filter((p) => p.match?.segregated === false).length;
  const matchedSegregated = byPa.filter((p) => p.match?.segregated === true).length;
  const segregates =
    matchedNotSegregated >= MIN_MATCHES
      ? 'no'
      : matchedSegregated >= MIN_MATCHES
        ? 'yes'
        : 'unknown';
  const steps = byPa.map((p) =>
    step({
      id: `PGDAS.INFERENCE.${p.pa}`,
      label: `Como o PGDAS-D de ${formatMonth(p.pa)} foi declarado (deduzido do DAS pago)`,
      formula:
        'DAS pago comparado ao DAS esperado em cada hipótese (anexo × segregou exportação); casa se a diferença ≤ max(R$ 1,00; 0,1%)',
      inputs: Object.fromEntries([
        ['paid', { value: p.paid.amount, unit: 'cents' as const }],
        ...p.expected.map((e) => [
          `${e.hypothesis.anexo}_${e.hypothesis.segregated ? 'segregated' : 'not_segregated'}`,
          { value: e.das, unit: 'cents' as const },
        ]),
      ]),
      result: {
        value:
          p.match === null
            ? 'indefinido'
            : `Anexo ${p.match.anexo}, ${p.match.segregated ? 'segregou' : 'não segregou'} a exportação`,
        unit: 'text',
      },
      rounding: 'NONE',
      month: p.pa,
    }),
  );
  return { byPa, segregates, matchedNotSegregated, matchedSegregated, steps };
}

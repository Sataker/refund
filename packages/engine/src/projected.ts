// ENGINE-SPEC C.1, item 4: when a month has no published parameter, the engine uses the last one in force and the
// trace says so ("parâmetro de 2027 ainda não publicado; usado o de 2026"). One step per rule lists every projected
// parameter that fed its cost (engine review of E5).
import { type ParameterKey, param } from './parameters/index.ts';
import type { Ctx } from './projection.ts';
import { formatMonth } from './rules/common.ts';
import { horizonPas, regimePas } from './scenario.ts';
import { step } from './trace.ts';
import type { Step, YearMonth } from './types.ts';

export interface ParameterRead {
  key: ParameterKey;
  months: readonly YearMonth[];
}

/** Months in which the annual IR of the horizon years and of the steady-state block is computed (C.5). */
export function irMonths(ctx: Ctx): YearMonth[] {
  const years = new Set(
    [...horizonPas(ctx), ...regimePas(ctx).slice(0, 1)].map((m) => m.slice(0, 4)),
  );
  return [...years].map((y) => `${y}-12` as YearMonth);
}

/** The reads behind the economic cost of a scenario (C.5): partner INSS per PA and the annual IR per year. */
export function costReads(ctx: Ctx): ParameterRead[] {
  const pas = [...horizonPas(ctx), ...regimePas(ctx)];
  const ir = irMonths(ctx);
  return [
    { key: 'inss.ceiling', months: pas },
    { key: 'irpf.annual.table', months: ir },
    { key: 'irpf.annual.reduction', months: ir },
    { key: 'irpf.annual.simplifiedDiscount', months: ir },
  ];
}

/** `<prefix>.PROJECTED_PARAMETERS`, or null when every parameter read was published for its month. */
export function projectedParametersStep(
  prefix: string,
  reads: readonly ParameterRead[],
): Step | null {
  const found: { key: ParameterKey; from: YearMonth; to: YearMonth; used: string }[] = [];
  let first: { lookup: ReturnType<typeof param>; month: YearMonth } | undefined;
  for (const { key, months } of reads) {
    const projected = [...months].sort().filter((m) => param(key, m).projected);
    if (projected.length === 0) continue;
    const from = projected[0] as YearMonth;
    const lookup = param(key, from);
    found.push({
      key,
      from,
      to: projected.at(-1) as YearMonth,
      used: lookup.effectiveFrom.slice(0, 4),
    });
    first ??= { lookup, month: from };
  }
  if (first === undefined) return null;
  return step({
    id: `${prefix}.PROJECTED_PARAMETERS`,
    label: 'Parâmetros ainda não publicados para os meses calculados',
    formula: 'usado o último valor publicado; a economia compara cenários com os mesmos parâmetros',
    inputs: Object.fromEntries(
      found.map((f) => [
        f.key,
        {
          value: `${formatMonth(f.from)} a ${formatMonth(f.to)}: usado o de ${f.used}`,
          unit: 'text' as const,
        },
      ]),
    ),
    result: {
      value: `${found.length} ${found.length === 1 ? 'parâmetro projetado' : 'parâmetros projetados'}`,
      unit: 'text',
    },
    rounding: 'NONE',
    month: first.month,
    parameter: first.lookup,
  });
}

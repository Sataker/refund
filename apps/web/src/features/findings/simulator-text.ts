import { formatBRL, formatRatePercent, formatYearMonth } from '@/lib/format';

// D32 (PLAN §18, 19/11): the Fator R slider is a safety margin. Its strings only format and compare the engine's own
// numbers: the margin cost is the difference of two engine per-year values (annualRegimeValue), and the month is the
// engine's R01 regimeFrom. Nothing here computes a tax.

/** One slider step and R01's per-year (steady-state) value at it, as the engine returned it. */
export interface MarginStepValue {
  margin: string;
  annual: number | null;
}

/** Margin as a decimal string → percentage points, pt-BR: "0.0025" → "0,25 p.p.", "0.01" → "1 p.p.". */
export function formatMarginPp(margin: string): string {
  return formatRatePercent(margin).replace('%', ' p.p.');
}

/**
 * "Cada 0,25 p.p. de folga custa R$ x por ano" when every adjacent pair of steps differs by the same per-year amount
 * (steps start at margin 0); otherwise "Essa folga custa R$ y por ano", y = per-year at margin 0 − at the chosen step.
 * Null when the engine gave no per-year value it needs, or when the uneven case is at margin 0 itself.
 */
export function marginCostText(steps: readonly MarginStepValue[], chosen: number): string | null {
  const uniform = uniformStepCost(steps);
  if (uniform !== null)
    return `Cada ${formatMarginPp(uniform.step)} de folga custa ${formatBRL(uniform.cost)} por ano`;
  const annual = steps.map((s) => s.annual);
  const first = annual[0];
  const at = annual[chosen];
  if (steps[0]?.margin !== '0' || first === null || first === undefined) return null;
  if (chosen <= 0 || at === null || at === undefined) return null;
  return `Essa folga custa ${formatBRL(first - at)} por ano`;
}

/**
 * The per-year cost of one slider step when every adjacent pair of steps differs by the same amount (steps start at
 * margin 0): the difference of two engine per-year values. Null otherwise.
 */
export function uniformStepCost(
  steps: readonly MarginStepValue[],
): { step: string; cost: number } | null {
  const annual = steps.map((s) => s.annual);
  const first = annual[0];
  if (steps[0]?.margin !== '0' || first === null || first === undefined) return null;
  const diffs: number[] = [];
  for (let i = 1; i < annual.length; i += 1) {
    const a = annual[i - 1];
    const b = annual[i];
    if (a === null || a === undefined || b === null || b === undefined) {
      diffs.length = 0;
      break;
    }
    diffs.push(a - b);
  }
  const step = steps[1]?.margin;
  const x = diffs[0];
  if (
    step !== undefined &&
    x !== undefined &&
    x > 0 &&
    diffs.length === annual.length - 1 &&
    diffs.every((d) => d === x)
  )
    return { step, cost: x };
  return null;
}

/**
 * UX review G2 H4, under the slider: "Mais folga antecipa o Anexo III ({mês} com {x} p.p.), mas custa R$ {c} por ano
 * a cada 0,25 p.p. depois disso." The month is the engine's regimeFrom at the chosen step, {x} the chosen margin and
 * {c} the uniform per-step difference of the engine's per-year values. Null when any of them is missing.
 */
export function marginTradeoffText(
  steps: readonly MarginStepValue[],
  margin: string,
  regimeFrom: string | null,
): string | null {
  const uniform = uniformStepCost(steps);
  if (uniform === null || regimeFrom === null) return null;
  return `Mais folga antecipa o Anexo III (${formatYearMonth(regimeFrom)} com ${formatMarginPp(margin)}), mas custa ${formatBRL(uniform.cost)} por ano a cada ${formatMarginPp(uniform.step)} depois disso.`;
}

/** "Sem folga suficiente, o Anexo III só começa em {mês/ano}" when the chosen step starts later than the recommended. */
export function lateStartText(
  chosenFrom: string | null,
  recommendedFrom: string | null,
): string | null {
  if (chosenFrom === null || recommendedFrom === null || chosenFrom <= recommendedFrom) return null;
  return `Sem folga suficiente, o Anexo III só começa em ${formatYearMonth(chosenFrom)}`;
}

/** "{valor} por ano depois, a partir de {mês/ano}" (the engine's per-year value and regimeFrom; UX review G2 H4). */
export function perYearText(annual: number | null, regimeFrom: string | null): string | null {
  if (annual === null || regimeFrom === null) return null;
  return `${formatBRL(annual)} por ano depois, a partir de ${formatYearMonth(regimeFrom)}`;
}

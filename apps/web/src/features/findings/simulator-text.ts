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
  ) {
    return `Cada ${formatMarginPp(step)} de folga custa ${formatBRL(x)} por ano`;
  }
  const at = annual[chosen];
  if (chosen <= 0 || at === null || at === undefined) return null;
  return `Essa folga custa ${formatBRL(first - at)} por ano`;
}

/** "Sem folga suficiente, o Anexo III só começa em {mês/ano}" when the chosen step starts later than the recommended. */
export function lateStartText(
  chosenFrom: string | null,
  recommendedFrom: string | null,
): string | null {
  if (chosenFrom === null || recommendedFrom === null || chosenFrom <= recommendedFrom) return null;
  return `Sem folga suficiente, o Anexo III só começa em ${formatYearMonth(chosenFrom)}`;
}

/** "{valor} por ano a partir de {mês/ano}" (the engine's per-year value and regimeFrom). */
export function perYearText(annual: number | null, regimeFrom: string | null): string | null {
  if (annual === null || regimeFrom === null) return null;
  return `${formatBRL(annual)} por ano a partir de ${formatYearMonth(regimeFrom)}`;
}

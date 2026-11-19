import { describe, expect, it } from 'vitest';
import { demoSnapshot } from '@/demo/snapshot.ts';
import { MARGIN_STEPS, marginOf } from './model';
import { marginStepValues } from './simulator-steps';
import {
  formatMarginPp,
  lateStartText,
  type MarginStepValue,
  marginCostText,
  marginTradeoffText,
  perYearText,
} from './simulator-text';

// D32 (PLAN §18): the slider is a safety margin; every string formats or compares the engine's own numbers.

const s = (text: string | null) => text?.replaceAll(' ', ' ').replaceAll(' ', ' ') ?? null;

describe('D32 simulator strings', () => {
  it('margin in p.p., pt-BR comma', () => {
    expect(formatMarginPp('0')).toBe('0 p.p.');
    expect(formatMarginPp('0.0025')).toBe('0,25 p.p.');
    expect(formatMarginPp('0.01')).toBe('1 p.p.');
    expect(formatMarginPp('0.0125')).toBe('1,25 p.p.');
  });

  it('even steps: "Cada 0,25 p.p. de folga custa R$ x por ano", x from two adjacent engine values', () => {
    const steps: MarginStepValue[] = [
      { margin: '0', annual: 100_000 },
      { margin: '0.0025', annual: 90_000 },
      { margin: '0.005', annual: 80_000 },
    ];
    expect(s(marginCostText(steps, 2))).toBe('Cada 0,25 p.p. de folga custa R$ 100,00 por ano');
    expect(s(marginCostText(steps, 0))).toBe('Cada 0,25 p.p. de folga custa R$ 100,00 por ano');
    // UX review G2 H4: the trade-off line under the slider, every value from the engine.
    expect(s(marginTradeoffText(steps, '0.005', '2027-04'))).toBe(
      'Mais folga antecipa o Anexo III (abr/2027 com 0,5 p.p.), mas custa R$ 100,00 por ano a cada 0,25 p.p. depois disso.',
    );
    expect(marginTradeoffText(steps, '0.005', null)).toBeNull();
    expect(
      marginTradeoffText(
        [
          { margin: '0', annual: 1 },
          { margin: '0.0025', annual: 1 },
        ],
        '0',
        '2027-04',
      ),
    ).toBeNull();
  });

  it('uneven steps: "Essa folga custa R$ y por ano", y = margin 0 − chosen step; nothing at margin 0', () => {
    const steps: MarginStepValue[] = [
      { margin: '0', annual: 100_000 },
      { margin: '0.0025', annual: 90_000 },
      { margin: '0.005', annual: 70_000 },
    ];
    expect(s(marginCostText(steps, 2))).toBe('Essa folga custa R$ 300,00 por ano');
    expect(s(marginCostText(steps, 1))).toBe('Essa folga custa R$ 100,00 por ano');
    expect(marginCostText(steps, 0)).toBeNull();
  });

  it('a step without a per-year value falls back to the chosen-step difference', () => {
    const steps: MarginStepValue[] = [
      { margin: '0', annual: 100_000 },
      { margin: '0.0025', annual: null },
      { margin: '0.005', annual: 80_000 },
    ];
    expect(s(marginCostText(steps, 2))).toBe('Essa folga custa R$ 200,00 por ano');
    expect(marginCostText(steps, 1)).toBeNull();
  });

  it('late start only when the chosen regimeFrom is after the recommended one', () => {
    expect(lateStartText('2028-01', '2027-04')).toBe(
      'Sem folga suficiente, o Anexo III só começa em jan/2028',
    );
    expect(lateStartText('2027-04', '2027-04')).toBeNull();
    expect(lateStartText('2027-02', '2027-04')).toBeNull();
    expect(lateStartText(null, '2027-04')).toBeNull();
  });

  it('per-year line: "{valor} por ano a partir de {mês/ano}"', () => {
    expect(s(perYearText(4289652, '2027-04'))).toBe(
      'R$ 42.896,52 por ano depois, a partir de abr/2027',
    );
    expect(perYearText(null, '2027-04')).toBeNull();
    expect(perYearText(4289652, null)).toBeNull();
  });

  it('hero: R$ 165,00 per 0,25 p.p. step (R$ 660,00 = 4 steps up to the recommended 1 p.p.)', async () => {
    const snap = await demoSnapshot('dev-exportador');
    if (!snap.ok) throw new Error(snap.reason);
    const steps = marginStepValues(snap.value.facts);
    const at = MARGIN_STEPS.indexOf(marginOf(snap.value.facts));
    expect(s(marginCostText(steps, at))).toBe('Cada 0,25 p.p. de folga custa R$ 165,00 por ano');
    expect((steps[0]?.annual ?? 0) - (steps[at]?.annual ?? 0)).toBe(66000);
    // Uneven variant of the same numbers (one step perturbed): the chosen-step difference, R$ 660,00.
    const uneven = steps.map((x, i) => (i === 20 ? { ...x, annual: 0 } : x));
    expect(s(marginCostText(uneven, at))).toBe('Essa folga custa R$ 660,00 por ano');
  });
});

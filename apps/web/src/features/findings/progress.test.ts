import type { Total } from '@refund/engine';
import { describe, expect, it } from 'vitest';
import { formatBRL } from '@/lib/format';
import { confirmCta, confirmProgress, estimatedLine } from './progress';

const total = (confirmed: number, estimated: number): Pick<Total, 'byConfidence'> => ({
  byConfidence: {
    confirmed: confirmed as Total['savings12m'],
    estimated: estimated as Total['savings12m'],
    depends_on_regulation: 0 as Total['savings12m'],
  },
});

describe('confirm progress (H2/M2: one source for confirmed, estimated and open)', () => {
  it('the big number is the confirmed cents only; estimated stays apart', () => {
    expect(confirmProgress(total(0, 2831652), ['a', 'b', 'c'], [])).toEqual({
      confirmed: 0,
      estimated: 2831652,
      open: 3,
    });
  });

  it('answered cards do not count as open; repeated ids count once', () => {
    expect(confirmProgress(total(100, 0), ['a', 'b', 'b', 'c'], ['b']).open).toBe(2);
    expect(confirmProgress(null, [], []).confirmed).toBe(0);
  });

  it('the CTA has no "até R$ X"', () => {
    expect(confirmCta(1)).toBe('Responda 1 pergunta para confirmar');
    expect(confirmCta(9)).toBe('Responda 9 perguntas para confirmar');
  });

  it('the second line names the estimate and the questions, or nothing', () => {
    expect(estimatedLine({ estimated: 2831652, open: 9 })).toBe(
      `+ ${formatBRL(2831652)} estimados — responda 9 perguntas para confirmar`,
    );
    expect(estimatedLine({ estimated: 2831652, open: 0 })).toBe(
      `+ ${formatBRL(2831652)} estimados (fora do número grande)`,
    );
    expect(estimatedLine({ estimated: 0, open: 3 })).toBeNull();
  });
});

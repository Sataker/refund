import { describe, expect, it } from 'vitest';
import { alertCostLabel } from './text.ts';

describe('alertCostLabel (UX review G2 M1, D47)', () => {
  it('reads the year from the engine title, old and D47 wording', () => {
    expect(
      alertCostLabel(
        'Um mês com mais de R$ 50 mil em dividendos teve R$ 9.000,00 retidos na fonte. Esse valor volta na declaração de 2027. Dividindo a distribuição em meses, não há retenção.',
      ),
    ).toBe('custo de esperar até a DIRPF 2027 (Selic)');
    expect(alertCostLabel('R$ 1,00 retidos voltam na DIRPF 2028.')).toBe(
      'custo de esperar até a DIRPF 2028 (Selic)',
    );
    expect(alertCostLabel('Sem ano.')).toBe('custo de esperar a restituição (Selic)');
  });
});

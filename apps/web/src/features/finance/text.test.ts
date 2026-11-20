import { describe, expect, it } from 'vitest';
import {
  cardBillText,
  comparedTo,
  firstSentence,
  formatBps,
  formatDate,
  groupKeys,
  listDates,
  sealDetail,
  shortMonth,
} from './text.ts';
import type { SealFinding } from './types.ts';

/** formatBRL uses a thin no-break space after R$ (§4.5); the expectations are written with a plain space. */
const plain = (s: string) => s.replaceAll('\u202f', ' ');

const finding = (o: Partial<SealFinding> = {}): SealFinding => ({
  ruleId: 'R05',
  type: 'savings',
  title: 'Segregar a exportação no PGDAS-D',
  marginalValue12m: 3_400_240,
  range: null,
  href: '/demo/dev-exportador/achados/R05',
  ...o,
});

describe('chip title and test keys (E14b review)', () => {
  it('the chip shows a title’s first sentence, never cut mid-sentence', () => {
    const r02 =
      'Um mês com mais de R$ 50 mil em dividendos teve R$ 9.000,00 retidos na fonte. Esse valor volta na declaração de 2027. Dividindo a distribuição em meses, não há retenção.';
    expect(firstSentence(r02)).toBe(
      'Um mês com mais de R$ 50 mil em dividendos teve R$ 9.000,00 retidos na fonte.',
    );
    expect(firstSentence('Conforme o art. 18 da LC 123. Depois disso, nada.')).toBe(
      'Conforme o art. 18 da LC 123.',
    );
    expect(firstSentence('Uma frase só')).toBe('Uma frase só');
    expect(sealDetail('attention', finding({ title: r02 }))).toBe(
      'Um mês com mais de R$ 50 mil em dividendos teve R$ 9.000,00 retidos na fonte.',
    );
  });

  it('a group present in both directions gets the direction in its test key', () => {
    expect(
      groupKeys([
        {
          groupId: 'holder_transfer',
          direction: 'inflow',
          slug: 'entre-voce-e-a-empresa-entradas',
        },
        { groupId: 'holder_transfer', direction: 'outflow', slug: 'entre-voce-e-a-empresa-saidas' },
        { groupId: 'das', direction: 'outflow', slug: 'das' },
      ]),
    ).toEqual({
      'entre-voce-e-a-empresa-entradas': 'holder_transfer-inflow',
      'entre-voce-e-a-empresa-saidas': 'holder_transfer-outflow',
      das: 'das',
    });
  });
});

describe('Finanças copy (Screen 5b)', () => {
  it('seal detail is only the finding’s own amount or title (ENGINE-SPEC E.9.2)', () => {
    expect(plain(sealDetail('lower_tax', finding()))).toBe('R$ 34.002,40 a menos em 12 meses');
    expect(
      plain(
        sealDetail(
          'money_to_receive',
          finding({ type: 'recovery', range: [3_978_768, 19_893_840] }),
        ),
      ),
    ).toBe('R$ 39.787,68 a R$ 198.938,40 · estimativa');
    // R02 (D29) has no range: its title.
    expect(
      plain(sealDetail('money_to_receive', finding({ ruleId: 'R02', type: 'alert', title: 'T' }))),
    ).toBe('T');
    // The engine's R02 carries [cost, cost]: never "R$ 1.111,70 a R$ 1.111,70" (UX review G2 H2).
    expect(
      plain(
        sealDetail(
          'money_to_receive',
          finding({
            ruleId: 'R02',
            type: 'alert',
            title: 'R$ 9.000,00 retidos.',
            range: [111_170, 111_170],
          }),
        ),
      ),
    ).toBe('R$ 9.000,00 retidos.');
    expect(plain(sealDetail('risk', finding({ title: 'Risco' })))).toBe('Risco');
    expect(plain(sealDetail('attention', finding({ title: 'Atenção' })))).toBe('Atenção');
    expect(plain(sealDetail('deductible', undefined))).toBe('na declaração completa');
    expect(plain(sealDetail('lower_tax', undefined))).toBe('');
  });

  it('formats basis points, dates and month comparisons without arithmetic on money', () => {
    expect(formatBps(4982)).toBe('49,82%');
    expect(formatBps(10_000)).toBe('100%');
    expect(formatBps(26)).toBe('0,26%');
    expect(formatBps(-1505)).toBe('−15,05%');
    expect(() => formatBps(1.5)).toThrow(RangeError);
    expect(formatDate('2026-07-10')).toBe('10/07/2026');
    expect(() => formatDate('2026')).toThrow(RangeError);
    expect(shortMonth('2025-11')).toBe('nov/25');
    expect(listDates(['2026-06-19'])).toBe('19/06/2026');
    expect(listDates(['2026-06-19', '2026-06-24', '2026-06-25'])).toBe(
      '19/06/2026, 24/06/2026 e 25/06/2026',
    );
    expect(plain(comparedTo(0, '2026-09'))).toBe('igual a set/2026');
    expect(plain(comparedTo(120_000, '2026-09'))).toBe('R$ 1.200,00 a mais que set/2026');
    expect(plain(comparedTo(-500, '2026-09'))).toBe('R$ 5,00 a menos que set/2026');
  });

  it('D43: the card-bill line says what left the tiles and why', () => {
    expect(cardBillText({ outflow: 0, inflow: 0 })).toBeNull();
    expect(plain(cardBillText({ outflow: 30_000, inflow: 0 }) ?? '')).toBe(
      'R$ 300,00 pagos na fatura do cartão não contam em “Saiu”: as compras feitas no cartão já contam lá.',
    );
    expect(plain(cardBillText({ outflow: 30_000, inflow: 30_000 }) ?? '')).toContain(
      'recebido na conta do cartão (R$ 300,00), também não conta em “Entrou”.',
    );
    expect(plain(cardBillText({ outflow: 0, inflow: 30_000 }) ?? '')).toBe(
      'R$ 300,00 recebidos na conta do cartão são o pagamento da fatura e não contam em “Entrou”.',
    );
  });
});

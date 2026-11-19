// "A lei mudou" summary: template only, naming corpus labels and no number (ARCHITECTURE §2.6; code review E16, M2).
import { describe, expect, it } from 'vitest';
import { templateDiffSummary } from '../src/index.ts';

describe('templateDiffSummary', () => {
  it('names only the corpus labels', () => {
    expect(
      templateDiffSummary({
        regulationLabel: 'LC 123/2006',
        articleLabels: ['LC 123/2006, art. 18-A, § 1º', 'LC 123/2006, art. 18-A, § 2º'],
      }),
    ).toBe(
      'Mudou o texto de LC 123/2006, art. 18-A, § 1º e LC 123/2006, art. 18-A, § 2º. Os cálculos que usam esses dispositivos foram marcados para revisão; nenhum número muda até a nova regra ser conferida e publicada no Refund.',
    );
    expect(
      templateDiffSummary({ regulationLabel: 'CTN', articleLabels: ['CTN, art. 168'] }),
    ).toContain('usam esse dispositivo');
  });

  it('a change outside the corpus provisions says so', () => {
    expect(templateDiffSummary({ regulationLabel: 'LC 123/2006', articleLabels: [] })).toBe(
      'Mudou o texto da página de LC 123/2006, fora dos dispositivos que o Refund usa nos cálculos. Uma pessoa vai conferir a mudança antes de qualquer ajuste.',
    );
  });
});

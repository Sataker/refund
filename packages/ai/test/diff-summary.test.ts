// "A lei mudou" summary: the model behind the guards, or the template (ARCHITECTURE §2.6; E16).
import { describe, expect, it } from 'vitest';
import { summarizeLawChange, templateDiffSummary } from '../src/diff-summary.ts';
import { DEFAULT_BUDGET, type GatewayOptions } from '../src/index.ts';
import { mockModel } from './model-mock.ts';

const diff =
  '-de até R$ 81.000,00 (oitenta e um mil reais)\n+de até R$ 140.000,00 (cento e quarenta mil reais)';
const input = {
  diff,
  regulationLabel: 'LC 123/2006',
  articleLabels: ['LC 123/2006, art. 18-A, § 1º', 'LC 123/2006, art. 18-A, § 2º'],
};
const options = (reply: () => string): GatewayOptions => ({
  budget: DEFAULT_BUDGET,
  model: () => mockModel(reply),
});

describe('summarizeLawChange', () => {
  it('without the AI capability: the template, naming only corpus labels', async () => {
    const r = await summarizeLawChange(input, null);
    expect(r).toEqual({
      summary:
        'Mudou o texto de LC 123/2006, art. 18-A, § 1º e LC 123/2006, art. 18-A, § 2º. Os cálculos que usam esses dispositivos foram marcados para revisão; nenhum número muda até a nova regra ser conferida e publicada no Refund.',
      origin: 'template',
      promptVersion: 'diff-template@1',
    });
  });

  it('a model answer that passes the guards is used', async () => {
    const ok = 'O limite do MEI passa de R$ 81 mil para R$ 140 mil.';
    const r = await summarizeLawChange(
      input,
      options(() => JSON.stringify({ summary: ok, mayAffectCalculation: true })),
    );
    expect(r).toMatchObject({ summary: ok, origin: 'llm', promptVersion: 'summarize-diff@1' });
  });

  it('an invented amount or citation falls back to the template', async () => {
    for (const bad of ['O limite passa para R$ 150 mil.', 'Veja a MP 1.303.']) {
      const r = await summarizeLawChange(
        input,
        options(() => JSON.stringify({ summary: bad, mayAffectCalculation: true })),
      );
      expect(r.origin).toBe('template');
    }
  });

  it('a model failure falls back to the template', async () => {
    const r = await summarizeLawChange(
      input,
      options(() => {
        throw new Error('down');
      }),
    );
    expect(r.origin).toBe('template');
  });

  it('a change outside the corpus provisions says so', () => {
    expect(templateDiffSummary({ regulationLabel: 'LC 123/2006', articleLabels: [] })).toBe(
      'Mudou o texto da página de LC 123/2006, fora dos dispositivos que o Refund usa nos cálculos. Uma pessoa vai conferir a mudança antes de qualquer ajuste.',
    );
  });
});

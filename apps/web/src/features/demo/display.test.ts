import { describe, expect, it } from 'vitest';
import { keepCurrency, SHORT_TITLE, sampleDescription, shortTitle } from './display.ts';

describe('Screen 4 display wording', () => {
  it('short headlines for R01 and R05 (IDENTITY-AND-UI §2.3); others keep the engine title', () => {
    expect(SHORT_TITLE).toEqual({
      R01: 'Aumentar seu pró-labore reduz seu imposto',
      R05: 'Separar a receita de exportação no PGDAS-D',
    });
    expect(shortTitle('R01', 'Ajuste o pró-labore…')).toBe(SHORT_TITLE.R01);
    expect(shortTitle('R02', 'R$ 9.000,00 retidos…')).toBe('R$ 9.000,00 retidos…');
  });

  it('keeps R$ with its number', () => {
    expect(keepCurrency('R$ 9.000,00 e R$ 45.000,00')).toBe('R$ 9.000,00 e R$ 45.000,00');
  });

  it('masked people read as words, never [pessoa]', () => {
    expect(sampleDescription('PIX ENVIADO [pessoa] FERIAS', -81699)).toBe(
      'Pix enviado · pessoa física',
    );
    expect(sampleDescription('[pessoa]', -5590)).toBe('Pagamento · pessoa física');
    expect(sampleDescription('PAGAMENTO DAS - SIMPLES', -892500)).toBe('PAGAMENTO DAS - SIMPLES');
  });
});

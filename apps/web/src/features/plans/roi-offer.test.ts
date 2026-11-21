import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoiOffer, type RoiOfferProps } from './roi-offer';

// D58 review M1/M6: what the card claims, rendered as the server sends it.

const TERMS = { price: { monthlyCents: 6990, yearlyCents: 59900 }, guaranteeDays: 30 };

function render(props: Partial<RoiOfferProps>): string {
  return renderToStaticMarkup(
    createElement(RoiOffer, {
      variant: 'estimate',
      savingsCents: 1_246_338,
      terms: TERMS,
      href: '/app/plano?assinar=business-yearly',
      ...props,
    }),
  )
    .replaceAll(' ', ' ')
    .replaceAll(' ', ' ');
}

describe('RoiOffer', () => {
  it('the estimate: minimum, multiple, the monthly line marked "estimados", the guarantee from the payment', () => {
    const html = render({});
    expect(html).toContain('data-multiple="20"');
    expect(html).toContain('A economia mínima estimada paga o plano');
    expect(html).toContain('20 vezes');
    expect(html).toContain('R$ 1.038</span> estimados a mais de imposto');
    expect(html).toContain('30 dias a partir do pagamento');
    expect(html).not.toContain('confirmados');
  });

  it('below the price: no ROI claim and no multiple, only the plan', () => {
    const html = render({ variant: 'confirmed', savingsCents: 59_899 });
    expect(html).toContain('data-multiple=""');
    expect(html).not.toContain('roi-multiple');
    expect(html).not.toContain('vezes');
    expect(html).toContain('O plano Empresa custa');
  });

  it('no savings at all: no amount, no monthly line', () => {
    const html = render({ savingsCents: null });
    expect(html).not.toContain('roi-savings');
    expect(html).not.toContain('roi-monthly-loss');
  });

  it('example statements: the example wording, never "confirmados", no monthly line', () => {
    const html = render({ variant: 'confirmed', savingsCents: 6_231_892, example: true });
    expect(html).toContain('No extrato de exemplo:');
    expect(html).toContain('Neste exemplo, a economia paga o plano');
    expect(html).not.toContain('confirmados');
    expect(html).not.toContain('roi-monthly-loss');
  });

  it('a saving that starts later drops the monthly line; the confirmed wording otherwise', () => {
    const own = render({ variant: 'confirmed', savingsCents: 6_231_892 });
    expect(own).toContain('confirmados nos próximos 12 meses');
    expect(own).toContain('104 vezes');
    expect(own).toContain('roi-monthly-loss');
    expect(own).not.toContain('estimados');
    const later = render({ variant: 'confirmed', savingsCents: 6_231_892, startsLater: true });
    expect(later).not.toContain('roi-monthly-loss');
  });

  it('the two ways on come before the bullets (390 px: the free path above the fold)', () => {
    const html = render({
      secondary: createElement('a', { 'data-testid': 'free', href: '#' }, 'grátis'),
    });
    expect(html.indexOf('roi-unlock')).toBeLessThan(html.indexOf('<ul'));
    expect(html.indexOf('data-testid="free"')).toBeLessThan(html.indexOf('<ul'));
  });
});

import { describe, expect, it } from 'vitest';
import { type ConfirmCard, distinguishCards, exampleCardText } from './confirm';

const card = (id: string, text: string, mask: string | null): ConfirmCard => ({
  id,
  text,
  impact: 0,
  transactions: 1,
  sample: { date: '2026-10-01', label: 'x', amountCents: 100, mask },
  options: [],
  personaChoice: 'dont_know',
});

describe('Confirmar on example statements (bug bash 20/11, H1)', () => {
  it('the export card says the credits are in the example statement', () => {
    expect(
      exampleCardText(
        'Estes 12 créditos do exterior (R$ 216.000,00) são de clientes de fora do Brasil, por serviço usufruído lá (quem contrata e quem usa estão no exterior)?',
      ),
    ).toBe(
      'No extrato de exemplo há 12 créditos do exterior (R$ 216.000,00). São de clientes de fora do Brasil, por serviço usufruído lá (quem contrata e quem usa estão no exterior)?',
    );
  });

  it('every other card gets the example prefix', () => {
    expect(exampleCardText('Seu pró-labore bruto é R$ 2.000,00 por mês?')).toBe(
      'No extrato de exemplo: seu pró-labore bruto é R$ 2.000,00 por mês?',
    );
  });
});

describe('look-alike cards (bug bash 20/11)', () => {
  it('two cards with the same text get the masked document, or a number without one', () => {
    const out = distinguishCards([
      card(
        'a',
        'Os pagamentos a este profissional (R$ 100,00 no total) foram saúde?',
        '***.111.222-**',
      ),
      card('b', 'Os pagamentos a este profissional (R$ 100,00 no total) foram saúde?', null),
      card('c', 'Outra pergunta?', '***.333.444-**'),
    ]);
    expect(out.map((c) => c.text)).toEqual([
      'Os pagamentos a este profissional (R$ 100,00 no total) foram saúde? (documento ***.111.222-**)',
      'Os pagamentos a este profissional (R$ 100,00 no total) foram saúde? (pagamento 2)',
      'Outra pergunta?',
    ]);
  });
});

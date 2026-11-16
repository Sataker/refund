// TESTS §3.5 "redaction": the input sent to the model never holds a CPF, an e-mail or a person's name. Built over
// every hero transaction, each one dirtied the way a real bank statement can come (name, CPF, e-mail, phone).
import type { PersonaData } from '@refund/personas';
import type { LlmClassificationInput } from '@refund/pipeline';
import { detectPii } from '@refund/sources';
import { describe, expect, it } from 'vitest';
import { persona } from '../../pipeline/test/helpers.ts';
import { redactDescription, redactForModel, toModelInput } from '../src/index.ts';
import { explanationIsClean } from '../src/redact.ts';
import { syntheticCpf, syntheticEmail } from './pii.ts';

const PERSON = 'Joana Pereira Lima';
const tx: LlmClassificationInput = {
  transactionId: 't',
  redactedDescription: '',
  amountCents: 100,
  direction: 'outflow',
  holder: 'PJ',
  method: 'PIX',
  counterpartyType: null,
  counterpartyCnae: null,
  allowedCategories: ['unclassified'],
};
const phone = () => `(11) ${String(98_765)}-${String(4321)}`;

function dirtyInputs(data: PersonaData = persona()): LlmClassificationInput[] {
  return data.items.flatMap((item) =>
    item.accounts.flatMap((a) =>
      a.transactions.map((t, i) => {
        const isPerson = t.counterparty?.document?.type === 'CPF';
        const raw = isPerson
          ? `PIX ENVIADO ${PERSON.toUpperCase()} ${syntheticCpf(i % 2 === 0)} ${syntheticEmail('joana.lima')}`
          : `${t.description} ${syntheticCpf(false)} contato ${syntheticEmail('financeiro')} ${phone()}`;
        const counterparty = isPerson
          ? { document: t.counterparty?.document ?? null, name: PERSON }
          : (t.counterparty ?? undefined);
        return {
          transactionId: t.sourceId,
          // What the pipeline sends (classify/llm.ts → toLlmInput)…
          redactedDescription: redactDescription(raw, counterparty),
          amountCents: t.amountCents,
          direction: t.amountCents < 0 ? 'outflow' : 'inflow',
          holder: a.account.holder,
          method: t.method,
          counterpartyType: t.counterparty?.document?.type ?? null,
          counterpartyCnae: t.counterparty?.cnae ?? null,
          allowedCategories: ['unclassified'],
        } as LlmClassificationInput;
      }),
    ),
  );
}

describe('redaction before the model (rule 4)', () => {
  it('every hero transaction reaches the model without CPF, e-mail, phone or the person’s name', () => {
    const inputs = dirtyInputs();
    expect(inputs.length).toBe(174);
    for (const input of inputs) {
      // …and what @refund/ai lets out.
      const sent = toModelInput(input);
      expect(sent, input.redactedDescription).not.toBeNull();
      const text = sent?.redactedDescription ?? '';
      expect(detectPii(sent)).toEqual([]);
      expect(text).not.toMatch(/@|joana|pereira|lima/i);
      expect(text).not.toContain(syntheticCpf(false));
      expect(text).not.toContain(String(98_765));
    }
  });

  it('code review 16/11 (MEDIUM 3): names without a counterparty, MEI, spelled e-mails, BR phones', () => {
    const cnpj = { document: { type: 'CNPJ' }, name: null } as never;
    const cpf = syntheticCpf(false);
    const spaced = `${cpf.slice(0, 3)} ${cpf.slice(3, 6)} ${cpf.slice(6, 9)} ${cpf.slice(9)}`;
    const mobile = `${String(98_765)}${String(4321)}`;
    const cases: [string, unknown, string][] = [
      ['PIX ENVIADO JOANA LIMA', undefined, 'PIX ENVIADO [pessoa]'],
      ['PIX ENVIADO JOANA LIMA', { document: null, name: null }, 'PIX ENVIADO [pessoa]'],
      [
        `PIX JOANA LIMA ${cpf}`,
        { ...(cnpj as object), name: `JOANA LIMA ${cpf}` },
        'PIX [pessoa] [doc]',
      ],
      ['PIX JOANA LIMA MEI', { ...(cnpj as object), name: 'JOANA LIMA' }, 'PIX [pessoa] MEI'],
      ['COMPRA CARTAO JOANA LIMA MEI', undefined, 'COMPRA CARTAO [pessoa] MEI'],
      [
        `PIX p/ joana lima tel 11 ${mobile.slice(0, 5)} ${mobile.slice(5)}`,
        undefined,
        'PIX p/ [pessoa] tel [telefone]',
      ],
      [`PIX ${spaced} JOANA`, undefined, 'PIX [doc] [pessoa]'],
      ['TED joana(at)correio.com', undefined, 'TED [email]'],
      ['TED joana arroba correio.com.br', undefined, 'TED [email]'],
      [`PIX chave +55 11 ${mobile}`, undefined, 'PIX chave +55 11 #'], // the pipeline already made the run '#'
      [`PIX chave 11.${mobile.slice(0, 5)}-${mobile.slice(5)}`, undefined, 'PIX chave [telefone]'],
      [
        'PIX ENVIADO - ACADEMIA RITMO FORTE LTDA',
        undefined,
        'PIX ENVIADO - ACADEMIA RITMO FORTE LTDA',
      ],
      ['PIX RECEBIDO - MARINA DEV LTDA', undefined, 'PIX RECEBIDO - MARINA DEV LTDA'],
      ['PIX ENVIADO [pessoa] FERIAS', undefined, 'PIX ENVIADO [pessoa] FERIAS'],
    ];
    for (const [raw, counterparty, expected] of cases) {
      const fromPipeline = redactDescription(raw, counterparty as never);
      const sent = toModelInput({ ...tx, redactedDescription: fromPipeline });
      expect(sent?.redactedDescription, raw).toBe(expected);
    }
  });

  it('redactForModel strips documents, e-mails, phones and long numbers', () => {
    expect(
      redactForModel(
        `CPF ${syntheticCpf(true)} ${syntheticEmail('a.b')} tel ${phone()} pedido 12345678`,
      ),
    ).toBe('CPF [doc] [email] tel [telefone] pedido #');
  });

  it('the hero explanation payload is clean; one with a document is not', () => {
    const finding = { title: `Pró-labore ${syntheticCpf(true)}` };
    expect(explanationIsClean({ finding, articles: [], audience: 'owner' } as never)).toBe(false);
    expect(
      explanationIsClean({ finding: { title: 'ok' }, articles: [], audience: 'owner' } as never),
    ).toBe(true);
  });
});

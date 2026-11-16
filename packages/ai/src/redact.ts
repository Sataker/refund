// Last redaction before anything reaches a model (ARCHITECTURE §6.3; rule 4). The pipeline already sends
// `redactedDescription` (documents stripped, the counterparty's name replaced); this is the second line: it strips
// documents again, removes e-mails (also spelled out), phones, long numbers and spelled-out digit runs, replaces what
// looks like a person's name after a transfer/payment word or before a sole-proprietor marker, and refuses the payload
// if `detectPii` still finds anything.
import type { ExplanationInput, LlmClassificationInput } from '@refund/pipeline';
import { detectPii, redactDescription, stripDocuments } from '@refund/sources';

export { redactDescription };

// Any token with an "@" (the name redaction upstream may already have turned "joana.lima@…" into
// "[pessoa].[pessoa]@…"), and the spelled-out forms "joana(at)gmail.com", "joana at gmail dot com".
const EMAIL = /[^\s@]*@[^\s@]*/gu;
const EMAIL_SPELLED =
  /[^\s@]+\s*(?:\(at\)|\[at\]|\{at\}|\(arroba\)|\s+at\s+|\s+arroba\s+)\s*[^\s@]+(?:(?:\s+(?:dot|ponto)\s+|\.)[^\s@.]+)+/giu;
// Brazilian phones: "(DD) 9NNNN-NNNN", "DD.9NNNN-NNNN", "DD 9 NNNN NNNN", "+55 DD 9NNNNNNNN".
const PHONE = /(?<!\d)(?:\+?\s?55[\s.-]?)?\(?\d{2}\)?[\s.-]?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}(?!\d)/g;
// An 8-digit CNPJ root ("12.345.678"): an MEI's legal name is "<root> <person>".
const CNPJ_ROOT = /(?<![\d.])\d{2}\.?\d{3}\.?\d{3}(?![\d.])/g;
const LONG_DIGITS = /\d{6,}/g;
const DIGIT_WORDS =
  /(?<![\p{L}])(?:(?:zero|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)(?:\s+|$)){3,}/giu;

const fold = (w: string) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Words that open a transfer or payment: what follows may be a person. */
const TRIGGER =
  /^(?:pix\w*|ted\w*|doc|tev|transf\w*|pagamento|pagto|pgto|pag|salario|sal|dep|deposito|reembolso|compra)$/;
/** Between the trigger and the name. */
const SKIP =
  /^(?:enviad[oa]|recebid[oa]|agendad[oa]|para|pra|p\/|de|da|do|a|ao|cartao|debito|credito|conta|qr|code|online|-|–|—|#|\d+|\[\w+\])$/;
/** Never part of a name. */
const NOT_A_NAME = new Set(
  (
    'pix ted doc tev transf transferencia enviado enviada recebido recebida agendado agendada para pra qr code chave ' +
    'tel telefone fone cel celular cpf cnpj ref referente pagamento pgto pag pagto salario ferias decimo terceiro ' +
    'aluguel conta corrente poupanca boleto tarifa devolucao estorno reembolso cobranca compra cartao debito credito ' +
    'saque deposito dep parcela fatura assinatura mensalidade online'
  ).split(' '),
);
/** A run of names that ends in one of these is a company and is kept (it helps the classification). */
const COMPANY = new Set(
  'ltda ltda. sa s.a. s.a s/a cia cia. inc inc. llc corp ltd plc gmbh'.split(' '),
);
/** Sole proprietors: the name before them is a person (code review 16/11). */
const PERSON_MARKER = new Set(['me', 'epp', 'eireli', 'mei']);
const PARTICLE = new Set(['da', 'de', 'do', 'dos', 'das', 'e', "d'"]);

const isNameWord = (w: string) => {
  const f = fold(w);
  return (
    /^\p{L}[\p{L}'’-]*\p{L}$/u.test(w) &&
    !NOT_A_NAME.has(f) &&
    !COMPANY.has(f) &&
    !PERSON_MARKER.has(f)
  );
};
const isDigitish = (w: string) => /^(?:[\d.,/-]+|#|\[\w+\])$/.test(w);

/**
 * Person-name rule: after a transfer or payment word ("PIX ENVIADO JOANA LIMA", "TED RECEBIDA DE: JOANA") or before
 * ME/EPP/EIRELI/MEI ("JOANA LIMA 12.345.678 MEI"), a run of name-like words (particles inside it included, no length
 * cap) becomes "[pessoa]", unless the run ends in a company marker ("… E FILHOS LTDA").
 */
export function redactNames(text: string): string {
  const prepared = text
    .replace(/[:*|;,]/g, ' ')
    .replace(/\b(pix|ted|doc|enviad[oa]|recebid[oa])-/giu, '$1 ');
  const tokens = prepared.split(/\s+/).filter((t) => t !== '');
  const mark = new Array<boolean>(tokens.length).fill(false);

  /** The name run starting at `from` going `step`, particles allowed only between names. */
  const run = (from: number, step: 1 | -1): number[] => {
    const out: number[] = [];
    for (let i = from; i >= 0 && i < tokens.length; i += step) {
      const t = tokens[i] as string;
      if (isNameWord(t)) out.push(i);
      else if (PARTICLE.has(fold(t)) && out.length > 0 && isNameWord(tokens[i + step] ?? ''))
        out.push(i);
      else break;
    }
    return out;
  };

  tokens.forEach((t, i) => {
    const w = fold(t);
    if (TRIGGER.test(w)) {
      let j = i + 1;
      while (
        j < tokens.length &&
        (SKIP.test(fold(tokens[j] as string)) || TRIGGER.test(fold(tokens[j] as string)))
      )
        j++;
      const names = run(j, 1);
      const next = fold(tokens[(names.at(-1) ?? j) + 1] ?? '');
      if (names.length > 0 && !COMPANY.has(next)) for (const k of names) mark[k] = true;
    }
    if (PERSON_MARKER.has(w)) {
      let j = i - 1;
      while (j >= 0 && isDigitish(tokens[j] as string)) j--;
      for (const k of run(j, -1)) mark[k] = true;
    }
  });

  const out: string[] = [];
  tokens.forEach((t, i) => {
    if (!mark[i]) out.push(t);
    else if (!mark[i - 1]) out.push('[pessoa]');
  });
  return out.join(' ');
}

/** Documents → "[doc]", e-mails → "[email]", phones → "[telefone]", digit runs → "#" (no name rule). */
export function redactContacts(text: string): string {
  return stripDocuments(text)
    .replace(EMAIL_SPELLED, '[email]')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[telefone]')
    .replace(CNPJ_ROOT, '#')
    .replace(LONG_DIGITS, '#')
    .replace(DIGIT_WORDS, '# ');
}

/** `redactContacts`, then the person-name rule (`redactNames`): what a bank description may send to a model. */
export function redactForModel(text: string): string {
  return redactNames(redactContacts(text));
}

/** The classification input as it may leave the server, or null when something personal survives. */
export function toModelInput(input: LlmClassificationInput): LlmClassificationInput | null {
  const out = { ...input, redactedDescription: redactForModel(input.redactedDescription) };
  return detectPii({ description: out.redactedDescription }).length === 0 ? out : null;
}

/** True when the explanation payload (engine output and law text) carries nothing personal. */
export const explanationIsClean = (input: ExplanationInput): boolean =>
  detectPii({ finding: input.finding, articles: input.articles }).length === 0;

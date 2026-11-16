// Last redaction before anything reaches a model (ARCHITECTURE §6.3; rule 4). The pipeline already sends
// `redactedDescription` (documents stripped, the counterparty's name replaced); this is the second line: it strips
// documents again, removes e-mails (also "nome(at)dominio"), phones and long numbers, replaces what looks like a
// person's name after a transfer word or before "MEI", and refuses the payload if `detectPii` still finds anything.
import type { ExplanationInput, LlmClassificationInput } from '@refund/pipeline';
import { detectPii, redactDescription, stripDocuments } from '@refund/sources';

export { redactDescription };

// Any token with an "@" (the name redaction upstream may already have turned "joana.lima@…" into
// "[pessoa].[pessoa]@…"), and the spelled-out forms "joana(at)gmail.com", "joana arroba gmail.com".
const EMAIL = /[^\s@]*@[^\s@]*/gu;
const EMAIL_SPELLED =
  /[^\s@]+\s*(?:\(at\)|\[at\]|\{at\}|\(arroba\)|\s+at\s+|\s+arroba\s+)\s*[^\s@]+\.[\p{L}]{2,}/giu;
// Brazilian phones: "(DD) 9NNNN-NNNN", "DD.9NNNN-NNNN", "DD 9NNNN NNNN", "+55 DD 9NNNNNNNN".
const PHONE = /(?<!\d)(?:\+?\s?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\s?\d{4}[\s.-]?\d{4}(?!\d)/g;
const LONG_DIGITS = /\d{6,}/g;

/** Words of a bank description that are never a person's name. */
const NOT_A_NAME = new Set(
  (
    'pix ted doc tev transf transferencia enviado enviada recebido recebida agendado agendada para p de da do dos das ' +
    'a o e qr code chave tel telefone fone cel celular cpf cnpj ref referente pagamento pgto pag pagto salario ferias ' +
    'decimo terceiro aluguel conta corrente poupanca boleto tarifa devolucao estorno reembolso cobranca mei ' +
    'compra cartao debito credito saque deposito parcela fatura assinatura mensalidade'
  ).split(' '),
);
/** A run of names that ends in one of these is a company and is kept (it helps the classification). */
const COMPANY = new Set(
  'ltda sa s/a s.a. s.a eireli epp me inc llc corp cia co ltd gmbh bank banco'.split(' '),
);
const fold = (w: string) => w.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const isNameWord = (w: string) =>
  /^\p{L}{2,}$/u.test(w) && !NOT_A_NAME.has(fold(w)) && !COMPANY.has(fold(w));
const TRANSFER = /^(?:pix|ted|doc|tev|transf\w*)$/;
const SKIPPABLE = /^(?:enviad[oa]|recebid[oa]|agendad[oa]|p\/|para|de|-|–|:|\[\w+\])$/;

/**
 * Conservative person-name rule: after a transfer word ("PIX ENVIADO JOANA LIMA") or before "MEI" ("JOANA LIMA
 * MEI"), a run of 1–5 name-like words becomes "[pessoa]", unless the run ends in a company marker ("… LTDA").
 */
export function redactNames(text: string): string {
  const words = text.split(/(\s+)/);
  const tokens = words.filter((_, i) => i % 2 === 0);
  const mark = new Array<boolean>(tokens.length).fill(false);
  const runFrom = (start: number, step: 1 | -1): number[] => {
    const run: number[] = [];
    for (let i = start; i >= 0 && i < tokens.length && run.length < 5; i += step) {
      if (!isNameWord(tokens[i] as string)) break;
      run.push(i);
    }
    return run;
  };
  tokens.forEach((t, i) => {
    const w = fold(t);
    if (TRANSFER.test(w)) {
      let j = i + 1;
      while (j < tokens.length && SKIPPABLE.test(fold(tokens[j] as string))) j++;
      const run = runFrom(j, 1);
      const next = tokens[(run.at(-1) ?? j) + 1];
      if (run.length > 0 && (next === undefined || !COMPANY.has(fold(next))))
        for (const k of run) mark[k] = true;
    }
    if (w === 'mei') for (const k of runFrom(i - 1, -1)) mark[k] = true;
  });
  const out: string[] = [];
  tokens.forEach((t, i) => {
    if (mark[i]) {
      if (!mark[i - 1]) out.push('[pessoa]');
    } else out.push(t);
  });
  return out.join(' ');
}

/** Documents → "[doc]", e-mails → "[email]", phones → "[telefone]", names → "[pessoa]", 6+ digits → "#". */
export function redactForModel(text: string): string {
  const stripped = stripDocuments(text)
    .replace(EMAIL_SPELLED, '[email]')
    .replace(EMAIL, '[email]')
    .replace(PHONE, '[telefone]')
    .replace(LONG_DIGITS, '#');
  return redactNames(stripped);
}

/** The classification input as it may leave the server, or null when something personal survives. */
export function toModelInput(input: LlmClassificationInput): LlmClassificationInput | null {
  const out = { ...input, redactedDescription: redactForModel(input.redactedDescription) };
  return detectPii({ description: out.redactedDescription }).length === 0 ? out : null;
}

/** True when the explanation payload (engine output and law text) carries nothing personal. */
export const explanationIsClean = (input: ExplanationInput): boolean =>
  detectPii({ finding: input.finding, articles: input.articles }).length === 0;

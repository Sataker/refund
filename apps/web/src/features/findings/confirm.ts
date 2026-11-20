import type { ConfirmationQuestion, QuestionAnswer } from '@refund/pipeline';

// Screen 7 (IDENTITY-AND-UI §5; EXECUTION §9 16/11): the pipeline's cards, shown already answered as the persona
// would (ENGINE-SPEC F.2); a change goes back to the real pipeline. Pure: the server maps a visitor's choice back to
// the answer the pipeline understands, and only the persona's own answer reuses her exact value.

/** "Não sei": the card stays open and the pipeline treats it as unanswered (D22 for the payroll). */
export const DONT_KNOW = 'dont_know';

export interface ConfirmOption {
  value: string;
  label: string;
}

export interface ConfirmTx {
  date: string;
  label: string;
  amountCents: number;
  /** The counterparty's masked document (whitelist mask, never a name), to tell two look-alike cards apart. */
  mask?: string | null;
}

/**
 * Bug bash 20/11 (H1): on example statements a card states where its numbers come from, so "12 créditos do exterior"
 * never reads as the company's own (or as contradicting a profile answer like "exterior: Não").
 */
export function exampleCardText(text: string): string {
  const exportCard = /^Estes (\d+) créditos do exterior \(([^)]+)\) são /.exec(text);
  if (exportCard)
    return `No extrato de exemplo há ${exportCard[1]} créditos do exterior (${exportCard[2]}). São ${text.slice(exportCard[0].length)}`;
  const lowered = /^\p{Lu}\p{Ll}/u.test(text)
    ? `${text[0]?.toLowerCase() ?? ''}${text.slice(1)}`
    : text;
  return `No extrato de exemplo: ${lowered}`;
}

/**
 * Two cards with the same text (two payees asked the same question) get the payee's masked document, or else a
 * number, so they can be told apart (bug bash 20/11). Never a person's name: only the whitelist mask.
 */
export function distinguishCards(cards: readonly ConfirmCard[]): ConfirmCard[] {
  const count = new Map<string, number>();
  for (const c of cards) count.set(c.text, (count.get(c.text) ?? 0) + 1);
  const seen = new Map<string, number>();
  return cards.map((c) => {
    if ((count.get(c.text) ?? 0) < 2) return c;
    const n = (seen.get(c.text) ?? 0) + 1;
    seen.set(c.text, n);
    const mask = c.sample?.mask?.trim();
    return { ...c, text: `${c.text} (${mask ? `documento ${mask}` : `pagamento ${n}`})` };
  });
}

export interface ConfirmCard {
  id: string;
  text: string;
  /** D23: the pipeline's estimate of the card's effect on the total (cents). */
  impact: number;
  transactions: number;
  sample: ConfirmTx | null;
  options: ConfirmOption[];
  /** The persona's answer, as one of `options` (DONT_KNOW when she did not answer). */
  personaChoice: string;
}

const YES: ConfirmOption = { value: 'yes', label: 'Sim' };
const DONT_KNOW_OPTION: ConfirmOption = { value: DONT_KNOW, label: 'Não sei' };

/** The persona's answer value → the option it means. */
export function choiceOf(value: QuestionAnswer['value'] | undefined): string {
  if (value === undefined) return DONT_KNOW;
  if (value === true || value === 'yes') return 'yes';
  if (value === false || value === 'no') return 'no';
  if (typeof value === 'number') return 'yes'; // "Seu pró-labore bruto é R$ X?" answered with X
  if (typeof value === 'object') {
    const beneficiary = (value as Record<string, unknown>).beneficiary;
    return typeof beneficiary === 'string' ? beneficiary : 'yes'; // the payroll series = "use the report"
  }
  return value;
}

/**
 * The options a visitor can pick without typing: the card's own yes/no/beneficiary options; cards that need typed
 * values (pró-labore, payroll) offer the persona's value as "Sim"; every card ends with "Não sei".
 */
/** The payroll card (D22): answered only with a per-month gross payroll series, never a plain "yes". */
export const PAYROLL_CARD = 'clt-payroll-gross';

function optionsOf(q: ConfirmationQuestion, payrollReport: boolean): ConfirmOption[] {
  const own = q.options.filter((o) => ['yes', 'no', 'holder', 'dependent'].includes(o.value));
  // H1 (UX review 19/11): "Usar o relatório do contador" exists only where a payroll report exists (the persona's;
  // in /app, the sample statements'). Elsewhere the card offers only "Não sei" and stays FGTS ÷ 8%, estimated (D22).
  const base =
    own.length > 0
      ? own
      : q.id === PAYROLL_CARD
        ? payrollReport
          ? [{ value: 'yes', label: 'Usar o relatório do contador' }]
          : []
        : [YES];
  // ENGINE-SPEC E.2 / IDENTITY-AND-UI §2.3: the pró-labore card also takes "Outro valor" (typed, in cents).
  // "Enviar contracheque" needs an upload and stays out of /demo.
  const other = q.options.find((o) => o.value === 'other' && q.type === 'monthly_pro_labore');
  return [
    ...base.map((o) => ({ value: o.value, label: o.label })),
    ...(other ? [{ value: OTHER, label: other.label }] : []),
    DONT_KNOW_OPTION,
  ];
}

/** "Outro valor": the choice is `other:<cents>`, a positive integer amount typed by the visitor. */
export const OTHER = 'other';

export function otherCents(choice: string): number | null {
  const m = /^other:(\d{1,10})$/.exec(choice);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** "2.500,00" / "2500" / "2500,5" → cents (string parsing only; no float). Null when it is not an amount. */
export function parseReaisToCents(text: string): number | null {
  const m = /^\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?\s*$/.exec(text);
  if (!m) return null;
  const reais = (m[1] ?? '').replaceAll('.', '');
  const cents = (m[2] ?? '').padEnd(2, '0');
  const n = Number(`${reais}${cents}`);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function optionAllowed(card: ConfirmCard, choice: string): boolean {
  if (otherCents(choice) !== null) return card.options.some((o) => o.value === OTHER);
  return choice !== OTHER && card.options.some((o) => o.value === choice);
}

export function confirmCards(
  questions: readonly ConfirmationQuestion[],
  answers: readonly QuestionAnswer[],
  sampleOf: (transactionIds: readonly string[]) => ConfirmTx | null,
  /** Whether a payroll report backs the payroll card (/demo: the persona's; /app: only the sample statements). */
  { payrollReport = true }: { payrollReport?: boolean } = {},
): ConfirmCard[] {
  return questions.map((q) => ({
    id: q.id,
    text: q.text,
    impact: q.estimatedImpact ?? 0,
    transactions: q.transactionIds.length,
    sample: sampleOf(q.transactionIds),
    options: optionsOf(q, payrollReport),
    personaChoice: choiceOf(answers.find((a) => a.questionId === q.id)?.value),
  }));
}

/**
 * Visitor choices → pipeline answers. The persona's own choice reuses her exact answer (so the defaults give back
 * the video number to the cent); "Não sei" leaves the card unanswered; anything else is the option itself.
 * Unknown cards and options are dropped (the input comes from the browser).
 */
export function answersFromChoices(
  cards: readonly ConfirmCard[],
  personaAnswers: readonly QuestionAnswer[],
  choices: Readonly<Record<string, string>>,
): QuestionAnswer[] {
  const out: QuestionAnswer[] = [];
  for (const card of cards) {
    const choice = choices[card.id] ?? card.personaChoice;
    const persona = personaAnswers.find((a) => a.questionId === card.id);
    if (choice === DONT_KNOW || !optionAllowed(card, choice)) continue;
    const typed = otherCents(choice);
    if (typed !== null) {
      out.push({ questionId: card.id, value: typed });
      continue;
    }
    if (choice === card.personaChoice && persona) {
      out.push(persona);
      continue;
    }
    if (choice === 'holder' || choice === 'dependent') {
      const profession =
        persona && typeof persona.value === 'object'
          ? String((persona.value as Record<string, unknown>).profession ?? '')
          : '';
      out.push({ questionId: card.id, value: { beneficiary: choice, profession } });
      continue;
    }
    // Typed-value cards only offer the persona's value; without it there is nothing to send.
    if (choice === 'yes' && persona === undefined && card.options.every((o) => o.value !== 'no'))
      continue;
    out.push({ questionId: card.id, value: choice });
  }
  return out;
}

/** True when every choice equals the persona's (the build-time snapshot already is that result). */
export function isPersonaDefault(
  cards: readonly ConfirmCard[],
  choices: Readonly<Record<string, string>>,
): boolean {
  return cards.every((c) => (choices[c.id] ?? c.personaChoice) === c.personaChoice);
}

// Test harness: the hero persona injected as data (EXECUTION §9, E7: PersonaFinancial/ReplayCnpj receive persona
// data by injection) and a local fake LlmPort in `template` mode (TESTS §1: pipeline tests never import @refund/ai).
import type { Cents, CivilDate, Finding, Series } from '@refund/engine';
import { article as lawArticle } from '@refund/law';
import type { AnswerKey, CardAnswer, PersonaData } from '@refund/personas';
import answerKeyJson from '@refund/personas/data/dev-exportador.answer-key.json' with {
  type: 'json',
};
import dataJson from '@refund/personas/data/dev-exportador.json' with { type: 'json' };
import type { SourceTransaction } from '@refund/sources';
import {
  type AnalysisDeps,
  type AnalysisEvent,
  type AnalysisInput,
  type ConfirmationQuestion,
  type ExplanationOutput,
  type LlmPort,
  type PipelineResult,
  type QuestionAnswer,
  runAnalysis,
  transactionId,
} from '../src/index.ts';

export const persona = (): PersonaData => structuredClone(dataJson) as unknown as PersonaData;
export const answerKey = (): AnswerKey => structuredClone(answerKeyJson) as unknown as AnswerKey;

/** sourceId → NormalizedTransaction id (ARCHITECTURE §4.4: sha256 of account + sourceId). */
export function idMap(data: PersonaData = persona()): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of data.items)
    for (const a of item.accounts)
      for (const t of a.transactions)
        out.set(t.sourceId, transactionId(t.accountSourceId, t.sourceId));
  return out;
}

export const templateExplanation = (f: Finding): ExplanationOutput => ({
  text: `${f.title}.`,
  origin: 'template',
  guards: { numeric: 'not_applied', citation: 'not_applied' },
  promptVersion: 'test-template',
});

/** Local fake of the `template` mode: classifies nothing, explains with the finding's title. */
export function templatePort(overrides: Partial<LlmPort> = {}): LlmPort {
  return {
    mode: 'template',
    classify: async () => [],
    explain: async ({ finding }) => templateExplanation(finding),
    ...overrides,
  };
}

/** Fixed analysis clock: the persona's date (ARCHITECTURE §7.5); `now` advances 1 ms per call. */
export function fixedClock(today: CivilDate = '2026-11-12') {
  let t = Date.UTC(2026, 10, 12, 15, 0, 0);
  return { today: () => today, now: () => t++ };
}

export function deps(overrides: Partial<AnalysisDeps> = {}): AnalysisDeps {
  return {
    llm: templatePort(),
    article: (id) => {
      const a = lawArticle(id);
      return a === undefined ? undefined : { id: a.id, label: a.label, text: a.text };
    },
    clock: fixedClock(),
    pace: 'instant',
    wait: async () => {},
    ...overrides,
  };
}

/** F.2 default assumption: Selic fixture 15,00% (SGS 432 in /live). */
export const HERO_ASSUMPTIONS: AnalysisInput['userAssumptions'] = {
  selicAnnual: { value: '0.15', origin: 'default', editable: true, source: 'sgs:432 (fixture)' },
};

export function heroInput(overrides: Partial<AnalysisInput> = {}, data = persona()): AnalysisInput {
  const transactions: SourceTransaction[] = data.items.flatMap((i) =>
    i.accounts.flatMap((a) => a.transactions),
  );
  return {
    analysisId: 'demo:dev-exportador:test',
    persona: data.id,
    company: data.company,
    accounts: data.items.flatMap((i) => i.accounts.map((a) => a.account)),
    transactions,
    identities: data.items.map((i) => i.identity),
    userAssumptions: HERO_ASSUMPTIONS,
    confirmations: [],
    referenceMonth: data.referenceMonth,
    ...overrides,
  };
}

/** Drains the generator: every event and the returned result. */
export async function drain(
  gen: AsyncGenerator<AnalysisEvent, PipelineResult, void>,
): Promise<{ events: AnalysisEvent[]; result: PipelineResult }> {
  const events: AnalysisEvent[] = [];
  for (;;) {
    const next = await gen.next();
    if (next.done) return { events, result: next.value };
    events.push(next.value);
  }
}

export const run = (input: AnalysisInput = heroInput(), d: AnalysisDeps = deps()) =>
  drain(runAnalysis(input, d));

/**
 * ENGINE-SPEC F.2 "Cards answered (all yes)", from the answer key, addressed to the pipeline's questions: a card
 * is matched by its id (assumption cards) or by its exact transaction set.
 */
export function answersFromKey(
  questions: ConfirmationQuestion[],
  key = answerKey(),
): QuestionAnswer[] {
  const ids = idMap();
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const answerOf = (card: CardAnswer): QuestionAnswer['value'] => {
    if (card.id === 'psychologist-beneficiary') {
      // F.2: "psychologist = care for the holder"; the profession is the card's 2nd half (E.3 health_to_confirm).
      const professional = key.expectedFacts.pfDetails.healthExpenses.find(
        (h) => !/^\d/.test(h.cnaeOrProfession),
      );
      return { beneficiary: String(card.answer), profession: professional?.cnaeOrProfession ?? '' };
    }
    if (typeof card.answer === 'object') return card.answer as unknown as Record<string, number>;
    return card.answer;
  };
  const out: QuestionAnswer[] = [];
  for (const card of key.cardAnswers) {
    const txIds = card.transactionIds.map((s) => ids.get(s) ?? s);
    const q =
      questions.find((x) => x.id === card.id) ??
      questions.find((x) => card.transactionIds.length > 0 && sameSet(x.transactionIds, txIds));
    if (q !== undefined) out.push({ questionId: q.id, value: answerOf(card) });
  }
  return out;
}

/** The hero with every F.2 card answered (first run collects the questions, second run answers them). */
export async function heroAnswered(d: AnalysisDeps = deps()) {
  const first = await run(heroInput(), deps());
  const answers = answersFromKey(first.result.questions);
  return { first, answers, ...(await run(heroInput({ answers }), d)) };
}

export const seriesOf = (s: Series): Record<string, number> => ({ ...s });
export const sumSeries = (s: Series): number =>
  Object.values(s).reduce((a: number, b: Cents) => a + b, 0);

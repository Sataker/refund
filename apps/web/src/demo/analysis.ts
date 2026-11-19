import 'server-only';
import { createLlmPort } from '@refund/ai';
import type { CivilDate } from '@refund/engine';
import { article as lawArticle } from '@refund/law';
import {
  type AnalysisDeps,
  type AnalysisEvent,
  type AnalysisInput,
  type ConfirmationQuestion,
  type Pace,
  type PipelineResult,
  type QuestionAnswer,
  runAnalysis,
  transactionId,
} from '@refund/pipeline';
import { ReplaySeries, type SourceTransaction } from '@refund/sources';
import type { DemoPersona } from './catalog.ts';

// The /demo analysis (ARCHITECTURE §7.3, ADR-004): the REAL pipeline over the persona data, with the AI port in
// `template` mode (no key, no network) and a fixed clock on the persona's date. Only the pace changes
// between /api/demo/analise and the build-time pages; the numbers are the same (REVISAO B9).

/** Which accounts the visitor connected on the track ("Pular: só a PJ" leaves the PF out). */
export type DemoAccounts = 'all' | 'pj';

const SGS_SELIC = 432;

/** "15.00" (SGS 432, % a.a.) → "0.15". String arithmetic only (CLAUDE.md rule 2). */
export function percentToRate(percent: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(percent);
  if (!m) return null;
  const int = m[1] ?? '0';
  let digits = `${int}${m[2] ?? ''}`;
  let point = int.length - 2; // ÷ 100 = the decimal point two places to the left
  if (point < 1) {
    digits = `${'0'.repeat(1 - point)}${digits}`;
    point = 1;
  }
  const whole = digits.slice(0, point).replace(/^0+(?=\d)/, '');
  const dec = digits.slice(point).replace(/0+$/, '');
  return dec === '' ? whole : `${whole}.${dec}`;
}

/**
 * Selic from the replayed SGS fixture (ARCHITECTURE §7.2, "SGS series"): the last point up to the persona's
 * analysis date. Without it, the engine simply has no Selic (R02 shows no financial cost); it never invents one.
 */
async function selicAssumption(p: DemoPersona): Promise<AnalysisInput['userAssumptions']> {
  const r = await new ReplaySeries().series(
    SGS_SELIC,
    { from: p.data.period.from, to: p.data.analysisDate },
    { mode: 'replay' },
  );
  const last = r.ok ? r.value.at(-1) : undefined;
  const value = last ? percentToRate(last.value) : null;
  if (value === null) return {};
  return {
    selicAnnual: {
      value,
      origin: 'default',
      editable: true,
      source: `sgs:${SGS_SELIC} (fixture ${last?.date})`,
    },
  };
}

function demoClock(today: CivilDate): AnalysisDeps['clock'] {
  // `now` only stamps startedAt/durationMs; the persona's date keeps the build deterministic.
  return { today: () => today, now: () => Date.now() };
}

export function demoDeps(p: DemoPersona, pace: Pace, wait?: AnalysisDeps['wait']): AnalysisDeps {
  return {
    // One port per analysis (EXECUTION §9, E10 row: the transaction budget is per port instance).
    llm: createLlmPort({ mode: 'template' }),
    article: (id) => {
      const a = lawArticle(id);
      return a === undefined ? undefined : { id: a.id, label: a.label, text: a.text };
    },
    clock: demoClock(p.data.analysisDate),
    pace,
    ...(wait ? { wait } : {}),
  };
}

async function baseInput(
  p: DemoPersona,
  accounts: DemoAccounts,
  sessionId: string,
): Promise<AnalysisInput> {
  const items = p.data.items.filter((i) => accounts === 'all' || i.holder === 'PJ');
  const transactions: SourceTransaction[] = items.flatMap((i) =>
    i.accounts.flatMap((a) => a.transactions),
  );
  return {
    analysisId: `demo:${p.id}:${sessionId}`,
    persona: p.id,
    company: p.data.company,
    accounts: items.flatMap((i) => i.accounts.map((a) => a.account)),
    transactions,
    identities: items.map((i) => i.identity),
    userAssumptions: await selicAssumption(p),
    confirmations: [],
    referenceMonth: p.data.referenceMonth,
  };
}

/**
 * The persona's card answers addressed to the questions the pipeline actually asks: a card matches by its
 * stable id or by its exact transaction set (the same rule as the pipeline's own hero harness).
 */
export function addressAnswers(
  p: DemoPersona,
  questions: ConfirmationQuestion[],
): QuestionAnswer[] {
  const ids = new Map<string, string>();
  for (const item of p.data.items)
    for (const a of item.accounts)
      for (const t of a.transactions)
        ids.set(t.sourceId, transactionId(t.accountSourceId, t.sourceId));
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const out: QuestionAnswer[] = [];
  for (const card of p.cardAnswers) {
    const txIds = card.transactionIds.map((s) => ids.get(s) ?? s);
    const q =
      questions.find((x) => x.id === card.id) ??
      questions.find((x) => card.transactionIds.length > 0 && sameSet(x.transactionIds, txIds));
    if (q === undefined) continue;
    const value: QuestionAnswer['value'] = q.id.startsWith('health:')
      ? { beneficiary: String(card.answer), profession: p.healthProfession }
      : typeof card.answer === 'object'
        ? (card.answer as unknown as Record<string, number>)
        : card.answer;
    out.push({ questionId: q.id, value });
  }
  return out;
}

async function drain(
  gen: AsyncGenerator<AnalysisEvent, PipelineResult, void>,
): Promise<{ events: AnalysisEvent[]; result: PipelineResult }> {
  const events: AnalysisEvent[] = [];
  for (;;) {
    const next = await gen.next();
    if (next.done) return { events, result: next.value };
    events.push(next.value);
  }
}

export interface DemoQuestions {
  /** The cards the pipeline asks before any answer, in its order (D23: biggest effect on the total first). */
  questions: ConfirmationQuestion[];
  /** The persona's own answers to those cards (ENGINE-SPEC F.2). */
  answers: QuestionAnswer[];
}

const questionsCache = new Map<string, Promise<DemoQuestions>>();

/** First pass (instant, cached per process): which cards the pipeline asks, answered as the persona would. */
export function demoQuestions(
  p: DemoPersona,
  accounts: DemoAccounts = 'all',
): Promise<DemoQuestions> {
  const key = `${p.id}:${accounts}`;
  let cached = questionsCache.get(key);
  if (!cached) {
    cached = (async () => {
      const input = await baseInput(p, accounts, 'questions');
      const { result } = await drain(runAnalysis(input, demoDeps(p, 'instant')));
      return { questions: result.questions, answers: addressAnswers(p, result.questions) };
    })();
    // A failed run is not cached: the next request tries again.
    cached.catch(() => questionsCache.delete(key));
    questionsCache.set(key, cached);
  }
  return cached;
}

async function personaAnswers(p: DemoPersona, accounts: DemoAccounts): Promise<QuestionAnswer[]> {
  return (await demoQuestions(p, accounts)).answers;
}

/**
 * Screen 7 on /demo: the real pipeline again with the visitor's answers (ENGINE-SPEC C.9: only the engine
 * computes). No pace, no events kept: the result is all the caller needs.
 */
export async function runDemoWithAnswers(
  p: DemoPersona,
  answers: QuestionAnswer[],
): Promise<PipelineResult> {
  const input = await baseInput(p, 'all', 'answers');
  const { result } = await drain(runAnalysis({ ...input, answers }, demoDeps(p, 'instant')));
  return result;
}

export interface DemoRunOptions {
  accounts?: DemoAccounts;
  pace?: Pace;
  wait?: AnalysisDeps['wait'];
  sessionId?: string;
}

/** The analysis event stream for /api/demo/analise (ARCHITECTURE §4.6): the pipeline's own generator. */
export async function demoAnalysis(
  p: DemoPersona,
  options: DemoRunOptions = {},
): Promise<AsyncGenerator<AnalysisEvent, PipelineResult, void>> {
  const accounts = options.accounts ?? 'all';
  const input = await baseInput(p, accounts, options.sessionId ?? 'build');
  const answers = await personaAnswers(p, accounts);
  return runAnalysis({ ...input, answers }, demoDeps(p, options.pace ?? 'instant', options.wait));
}

const resultCache = new Map<string, Promise<{ events: AnalysisEvent[]; result: PipelineResult }>>();

/**
 * Build-time run (ARCHITECTURE §7.3: `const r = await runDemoAnalysis(persona)`), drained to the end at the
 * instant pace. Static pages (the selector, the dashboard in E13) read their numbers from here.
 */
export function runDemoAnalysis(
  p: DemoPersona,
  accounts: DemoAccounts = 'all',
): Promise<{ events: AnalysisEvent[]; result: PipelineResult }> {
  const key = `${p.id}:${accounts}`;
  let cached = resultCache.get(key);
  if (!cached) {
    cached = demoAnalysis(p, { accounts }).then(drain);
    cached.catch(() => resultCache.delete(key));
    resultCache.set(key, cached);
  }
  return cached;
}

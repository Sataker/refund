// runAnalysis(): normalize → classify (rules → LlmPort → cards) → facts → engine (once) → events, in the fixed order
// of ARCHITECTURE §4.4 (the event-order test locks it). No I/O: data, model and clock come in through the ports.
import {
  analyze,
  type Cents,
  ENGINE_VERSION,
  type Facts,
  type Finding,
  fatorR,
  PARAMETERS_VERSION,
  type Series,
  type Total,
  type YearMonth,
} from '@refund/engine';
import { redactDescription, type SourceTransaction } from '@refund/sources';
import { cnaeTaxProfile } from './classify/cnae.ts';
import { holderIdentity } from './classify/identity.ts';
import {
  type AnswerValue,
  applyRules,
  applyUserInput,
  type Classified,
  classifyWithLlm,
  initial,
  toLlmInput,
} from './classify/index.ts';
import { boundedCall, DEFAULT_LLM_TIMEOUT_MS } from './classify/llm.ts';
import type { AnalysisEvent, AnalysisStage, FindingDto, TotalDto } from './events.ts';
import { buildFacts, parameterMonth, regimeOf } from './facts.ts';
import { rankByEffect } from './impact.ts';
import { Normalizer } from './normalize.ts';
import { defaultWait, delayBefore } from './pace.ts';
import type { ExplanationOutput } from './ports.ts';
import { buildQuestions } from './questions.ts';
import type {
  AnalysisDeps,
  AnalysisInput,
  ConfirmationQuestion,
  NormalizedTransaction,
  PipelineResult,
} from './types.ts';

const PROGRESS_EVERY = 200;
const SAMPLE_SIZE = 8;

const ZERO_TOTAL = (): Total => ({
  savings12m: 0 as Cents,
  annualRegimeSavings: null,
  byConfidence: {
    confirmed: 0 as Cents,
    estimated: 0 as Cents,
    depends_on_regulation: 0 as Cents,
  },
  recoveryRange: null,
});

/** The counter climbs exactly up to the engine's total (ADR-003): Σ of the findings already sent. */
export function accumulate(partial: Total, f: Finding): Total {
  const next: Total = {
    ...partial,
    byConfidence: { ...partial.byConfidence },
  };
  if (f.countsInTotal) {
    next.savings12m = (partial.savings12m + f.marginalValue12m) as Cents;
    next.byConfidence[f.confidence] = (partial.byConfidence[f.confidence] +
      f.marginalValue12m) as Cents;
    next.annualRegimeSavings = ((partial.annualRegimeSavings ?? 0) +
      (f.annualRegimeValue ?? 0)) as Cents;
  }
  if (f.type === 'recovery' && f.range !== undefined) next.recoveryRange = f.range;
  return next;
}

export function toFindingDto(analysisId: string, f: Finding): FindingDto {
  const { trace, ...rest } = f;
  return {
    ...rest,
    id: `${analysisId}:${f.ruleId}`,
    // The UI shows this until the `explanation` event replaces it.
    explanation: f.title,
    explanationOrigin: 'template',
    trace,
    traceLocked: false, // the paywall is applied by the backend (ARCHITECTURE §8.3), never here
  };
}

const templateOutput = (f: Finding): ExplanationOutput => ({
  text: f.title,
  origin: 'template',
  guards: { numeric: 'not_applied', citation: 'not_applied' },
  promptVersion: 'pipeline-fallback',
});

const isExplanation = (x: unknown): x is ExplanationOutput =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as ExplanationOutput).text === 'string' &&
  (x as ExplanationOutput).text.length > 0 &&
  ['llm', 'recording', 'template'].includes((x as ExplanationOutput).origin);

async function* pages(
  source: AnalysisInput['transactions'],
): AsyncGenerator<SourceTransaction[], void, void> {
  if (Array.isArray(source)) {
    yield source;
    return;
  }
  for await (const page of source as AsyncIterable<SourceTransaction[]>) yield page;
}

/** Up to 8 transactions spread over the period, masked, for the column that "scrolls". */
function sampleOf(
  txs: readonly NormalizedTransaction[],
  originals: ReadonlyMap<string, SourceTransaction>,
): Extract<AnalysisEvent, { type: 'transaction_sample' }>['items'] {
  const step = Math.max(1, Math.floor(txs.length / SAMPLE_SIZE));
  const picked: NormalizedTransaction[] = [];
  for (let i = 0; i < txs.length && picked.length < SAMPLE_SIZE; i += step) {
    const t = txs[i];
    if (t !== undefined) picked.push(t);
  }
  return picked.map((t) => {
    const o = originals.get(t.id);
    return {
      date: t.date,
      description: redactDescription(o?.description ?? t.description, t.counterparty ?? undefined),
      amountCents: t.direction === 'inflow' ? t.amountCents : -t.amountCents,
      holder: t.holder,
    };
  });
}

function countByOrigin(classified: readonly Classified[]) {
  const byOrigin = { rule: 0, llm: 0, user: 0 };
  let pending = 0;
  let unclassified = 0;
  for (const { classification: c } of classified) {
    if (c.status === 'unclassified') unclassified += 1;
    else byOrigin[c.origin] += 1;
    if (c.status === 'pending_confirmation') pending += 1;
  }
  return { byOrigin, pending, unclassified };
}

function factsSummary(facts: Facts): Extract<AnalysisEvent, { type: 'facts_summary' }> {
  const sum = (s: Series): number => Object.values(s).reduce((a, b) => a + b, 0);
  const rbt12 = sum(facts.monthlyRevenue.value);
  const payroll12 =
    sum(facts.cltPayroll.grossPay.value) +
    sum(facts.cltPayroll.fgtsPaid.value) +
    sum(facts.cltPayroll.cppOutsideDas.value) +
    sum(facts.partner.grossProLabore.value);
  let ratio: string | null = null;
  if (facts.companyDetails.value.subjectToFatorR) {
    // C.3.5 with the observed window ending at the reference month (display only; the engine recomputes per PA).
    ratio = fatorR(payroll12 as Cents, rbt12 as Cents, parameterMonth(facts.referenceMonth)).value;
  }
  const months = Object.keys(facts.monthlyRevenue.value) as YearMonth[];
  const monthsWithData = months.filter((m) =>
    [facts.monthlyRevenue, facts.partner.grossProLabore, facts.cltPayroll.grossPay].some(
      (s) => (s.value[m] ?? 0) > 0,
    ),
  ).length;
  return {
    type: 'facts_summary',
    rbt12Cents: rbt12,
    payroll12Cents: payroll12,
    fatorR: ratio,
    monthsWithData,
  };
}

export async function* runAnalysis(
  input: AnalysisInput,
  deps: AnalysisDeps,
): AsyncGenerator<AnalysisEvent, PipelineResult, void> {
  const pace = deps?.pace ?? 'instant';
  const wait = deps?.wait ?? defaultWait;
  const timeoutMs = deps?.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  let findingsSent = 0;
  // The stage in progress, carried by the catch-all error (code review #3).
  let stage: AnalysisStage | undefined;
  const paced = async <E extends AnalysisEvent>(e: E): Promise<E> => {
    if (e.type === 'stage' && e.status === 'started') stage = e.stage;
    const ms = delayBefore(pace, e, findingsSent);
    if (ms > 0) await wait(ms);
    return e;
  };
  /** The clock is a port: a clock that throws or returns garbage never breaks the run (code review #4). */
  const safeNow = (): number | null => {
    try {
      const v = deps.clock.now();
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  };
  let t0: number | null = null;

  const result: PipelineResult = {
    engineResult: null,
    facts: null,
    classifications: [],
    questions: [],
    explanations: {},
    metrics: {
      transactions: 0,
      byOrigin: { rule: 0, llm: 0, user: 0, unclassified: 0 },
      durationMs: 0,
    },
  };
  const finish = async (
    status: 'completed' | 'awaiting_confirmation',
  ): Promise<Extract<AnalysisEvent, { type: 'end' }>> => {
    const now = safeNow();
    result.metrics.durationMs = t0 === null || now === null ? 0 : Math.max(0, now - t0);
    return paced({
      type: 'end',
      analysisId: String(input?.analysisId ?? ''),
      status,
      durationMs: result.metrics.durationMs,
    });
  };

  try {
    // ---------- 1. Start (inside the try: a bad clock or input becomes an error event, never a throw) ----------
    const started = deps.clock.now();
    t0 = started;
    yield await paced({
      type: 'start',
      analysisId: input.analysisId,
      origin: input.analysisId.startsWith('demo:') ? 'demo' : 'live',
      ...(input.persona === undefined ? {} : { persona: input.persona }),
      accounts: {
        pf: input.accounts.filter((a) => a.holder === 'PF').length,
        pj: input.accounts.filter((a) => a.holder === 'PJ').length,
      },
      engineVersion: ENGINE_VERSION,
      parametersVersion: PARAMETERS_VERSION,
      // The only Date in the pipeline: formats the injected clock's timestamp (scripts/lint-conventions.ts).
      startedAt: new Date(started).toISOString(),
    });

    // ---------- 2. Normalization ----------
    yield await paced({
      type: 'stage',
      stage: 'normalization',
      status: 'started',
      label: 'Lendo as transações',
    });
    const known = Array.isArray(input.transactions) ? input.transactions.length : null;
    const normalizer = new Normalizer(input.accounts);
    let read = 0;
    for await (const page of pages(input.transactions)) {
      for (const tx of page) {
        read += 1;
        normalizer.add(tx);
        if (read % PROGRESS_EVERY === 0) {
          yield await paced({
            type: 'stage',
            stage: 'normalization',
            status: 'started',
            label: `Lendo ${read} transações`,
            progress: { done: read, total: known ?? read },
          });
        }
      }
    }
    const txs = normalizer.result();
    result.metrics.transactions = txs.length;
    yield await paced({ type: 'transaction_sample', items: sampleOf(txs, normalizer.originals) });
    yield await paced({
      type: 'stage',
      stage: 'normalization',
      status: 'completed',
      label: `${txs.length} transações lidas`,
      progress: { done: read, total: known ?? read },
    });

    // ---------- 3. Classification: rules → LLM (leftovers) ----------
    yield await paced({
      type: 'stage',
      stage: 'classification',
      status: 'started',
      label: 'Separando empresa e pessoa',
    });
    const regime = regimeOf(input.company);
    const identity = holderIdentity(
      input.identities,
      input.company.cnpj,
      input.accounts.some((a) => a.holder === 'PF'),
    );
    const anexo = cnaeTaxProfile(input.company.primaryCnae.code)?.baseAnexo;
    const hits = applyRules(txs, {
      identity,
      primaryCnae: input.company.primaryCnae.code,
      revenueCategory: anexo === 'I' || anexo === 'II' ? 'sales_revenue' : 'service_revenue',
      referenceMonth: input.referenceMonth,
    });
    const leftovers = txs.filter((t) => !hits.has(t.id));
    const verdicts =
      leftovers.length === 0
        ? new Map()
        : await classifyWithLlm(
            leftovers.map((t) =>
              toLlmInput(t, normalizer.originals.get(t.id)?.description ?? t.description),
            ),
            deps.llm,
            timeoutMs,
          );
    const classified = txs.map((t) =>
      initial(t, hits.get(t.id), verdicts.get(t.id), leftovers.length > 0),
    );
    // Before any answer: the what-ifs of D23 replay the answers on a copy of this.
    const pristine = structuredClone(classified);
    const answers = new Map<string, AnswerValue>(
      (input.answers ?? []).map((a) => [a.questionId, a.value]),
    );
    applyUserInput(classified, answers, input.confirmations);
    result.classifications = classified.map((c) => c.classification);
    const counts = countByOrigin(classified);
    result.metrics.byOrigin = { ...counts.byOrigin, unclassified: counts.unclassified };
    yield await paced({
      type: 'classification_summary',
      total: txs.length,
      byOrigin: counts.byOrigin,
      pending: counts.pending,
      unclassified: counts.unclassified,
    });
    yield await paced({
      type: 'stage',
      stage: 'classification',
      status: 'completed',
      label: 'Empresa e pessoa separadas',
    });

    // ---------- 4. Questions, by estimated impact ----------
    const analysisDate = deps.clock.today();
    const engineOptions =
      deps.parameterSet === undefined ? undefined : { parameters: deps.parameterSet };
    const open = buildQuestions(classified, {
      regime,
      answers,
      exportsGoods: anexo === 'I' || anexo === 'II',
    });
    const questions: ConfirmationQuestion[] =
      open.length === 0
        ? open
        : rankByEffect(open, classified, answers, (what) => {
            const list = structuredClone(pristine);
            applyUserInput(list, what, input.confirmations);
            const f = buildFacts({
              classified: list,
              answers: what,
              company: input.company,
              referenceMonth: input.referenceMonth,
              analysisDate,
              userAssumptions: input.userAssumptions,
            });
            if (!f.ok) return null;
            const r = analyze(f.value, engineOptions);
            return r.ok ? r.value.total.savings12m : null;
          });
    result.questions = questions;
    for (const question of questions) yield await paced({ type: 'question', question });
    const endStatus = questions.length > 0 ? 'awaiting_confirmation' : 'completed';

    // ---------- 5. Facts ----------
    yield await paced({
      type: 'stage',
      stage: 'facts',
      status: 'started',
      label: 'Montando os números',
    });
    const built = buildFacts({
      classified,
      answers,
      company: input.company,
      referenceMonth: input.referenceMonth,
      analysisDate,
      userAssumptions: input.userAssumptions,
    });
    if (!built.ok) {
      yield await paced({ type: 'error', ...built.error, stage: 'facts' });
      yield await finish(endStatus);
      return result;
    }
    const facts = built.value;
    result.facts = facts;
    yield await paced(factsSummary(facts));
    yield await paced({
      type: 'stage',
      stage: 'facts',
      status: 'completed',
      label: 'Números prontos',
    });

    // ---------- 6–8. Engine, once (combined scenario) ----------
    yield await paced({
      type: 'stage',
      stage: 'rules',
      status: 'started',
      label: 'Aplicando as regras',
    });
    const engine = analyze(facts, engineOptions);
    if (!engine.ok) {
      yield await paced({
        type: 'error',
        code: engine.error.code,
        message: engine.error.message,
        recoverable: engine.error.recoverable,
        stage: 'rules',
      });
      yield await finish(endStatus);
      return result;
    }
    result.engineResult = engine.value;
    const ordered = [...engine.value.findings].sort((a, b) => a.order - b.order);
    const inTotalList = ordered.filter((f) => f.type === 'savings' || f.type === 'recovery');
    const alerts = ordered.filter((f) => f.type === 'alert' || f.type === 'risk');
    let partial = ZERO_TOTAL();
    for (const f of inTotalList) {
      partial = accumulate(partial, f);
      yield await paced({
        type: 'finding',
        finding: toFindingDto(input.analysisId, f),
        partialTotal: partial,
      });
      findingsSent += 1;
    }
    for (const f of alerts) {
      yield await paced({ type: 'alert', finding: toFindingDto(input.analysisId, f) });
    }
    const total: TotalDto = engine.value.total;
    yield await paced({ type: 'total', total });
    yield await paced({
      type: 'stage',
      stage: 'rules',
      status: 'completed',
      label: 'Regras aplicadas',
    });

    // ---------- 9. Explanations (the UI shows the template until each one arrives) ----------
    yield await paced({
      type: 'stage',
      stage: 'explanation',
      status: 'started',
      label: 'Explicando cada achado',
    });
    for (const f of [...inTotalList, ...alerts]) {
      const articles = f.refs.flatMap((r) => {
        const a = deps.article(r.id);
        return a === undefined ? [] : [a];
      });
      const fallback = templateOutput(f);
      const out = await boundedCall(
        () => deps.llm.explain({ finding: f, articles, audience: 'owner' }),
        fallback,
        timeoutMs,
      );
      const explanation = isExplanation(out) ? out : fallback;
      result.explanations[f.ruleId] = explanation;
      yield await paced({
        type: 'explanation',
        ruleId: f.ruleId,
        text: explanation.text,
        origin: explanation.origin,
      });
    }
    yield await paced({
      type: 'stage',
      stage: 'explanation',
      status: 'completed',
      label: 'Pronto',
    });
    yield await finish(endStatus);
    return result;
  } catch {
    // Nothing crosses the package as an exception (CLAUDE.md): a bug becomes a recoverable error event.
    yield await paced({
      type: 'error',
      code: 'PIPELINE_FAILED',
      message: 'A análise parou no meio. Mostramos o que já achamos; tente de novo.',
      recoverable: true,
      ...(stage === undefined ? {} : { stage }),
    });
    yield await finish(result.questions.length > 0 ? 'awaiting_confirmation' : 'completed');
    return result;
  }
}

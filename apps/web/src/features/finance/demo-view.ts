import 'server-only';
// /demo Finanças at build time (ARCHITECTURE §7, §4.4 "Usage"): the persona's real pipeline run with the canonical
// answers of its answer key, then `financialViewOfRun`. Zero network and zero environment variables: the LLM port is
// the template, the clock is the persona's analysis date. When E13 ships the shared /demo snapshot, read it from there.
import type { Finding } from '@refund/engine';
import { article } from '@refund/law';
import type { AnswerKey, CardAnswer, PersonaData } from '@refund/personas';
import answerKeyJson from '@refund/personas/data/dev-exportador.answer-key.json' with {
  type: 'json',
};
import personaJson from '@refund/personas/data/dev-exportador.json' with { type: 'json' };
import {
  type AnalysisDeps,
  type AnalysisInput,
  type ConfirmationQuestion,
  duplicateRemovals,
  type FinancialView,
  financialViewOfRun,
  type LlmPort,
  normalizeTransactions,
  type PipelineResult,
  type QuestionAnswer,
  runAnalysis,
  transactionId,
} from '@refund/pipeline';
import { redactDescription, type SourceTransaction } from '@refund/sources';
import { cache } from 'react';
import { exclusionSets, storageKey, variantKey } from './exclusions.ts';
import type { FinanceScreenData, SealFinding, TxRow } from './types.ts';

interface DemoPersona {
  data: PersonaData;
  answerKey: AnswerKey;
}

const PERSONAS: Record<string, DemoPersona> = {
  'dev-exportador': {
    data: personaJson as unknown as PersonaData,
    answerKey: answerKeyJson as unknown as AnswerKey,
  },
};

/** 2^3 = 8 prebuilt views at most (D31 b; more would bloat the static page). */
const MAX_SUSPECTS = 3;

export const DEMO_FINANCE_PERSONAS: readonly string[] = Object.keys(PERSONAS);

const templatePort: LlmPort = {
  mode: 'template',
  classify: async () => [],
  explain: async ({ finding }) => ({
    text: finding.title,
    origin: 'template',
    guards: { numeric: 'not_applied', citation: 'not_applied' },
    promptVersion: 'template',
  }),
};

function deps(data: PersonaData): AnalysisDeps {
  let t = 0;
  return {
    llm: templatePort,
    article: (id) => {
      const a = article(id);
      return a === undefined ? undefined : { id: a.id, label: a.label, text: a.text };
    },
    clock: { today: () => data.analysisDate, now: () => t++ },
    pace: 'instant',
    wait: async () => {},
  };
}

function input(data: PersonaData, answers?: QuestionAnswer[]): AnalysisInput {
  return {
    analysisId: `demo:${data.id}:build`,
    persona: data.id,
    company: data.company,
    accounts: data.items.flatMap((i) => i.accounts.map((a) => a.account)),
    transactions: data.items.flatMap((i) => i.accounts.flatMap((a) => a.transactions)),
    identities: data.items.map((i) => i.identity),
    // ENGINE-SPEC F.2 default assumption (Selic fixture), as the persona's golden run.
    userAssumptions: {
      selicAnnual: {
        value: '0.15',
        origin: 'default',
        editable: true,
        source: 'sgs:432 (fixture)',
      },
    },
    confirmations: [],
    referenceMonth: data.referenceMonth,
    ...(answers === undefined ? {} : { answers }),
  };
}

async function drain(gen: ReturnType<typeof runAnalysis>): Promise<PipelineResult> {
  for (;;) {
    const next = await gen.next();
    if (next.done) return next.value;
  }
}

/** The answer key's cards addressed to the run's questions: by id, or by the exact transaction set. */
function canonicalAnswers(
  questions: readonly ConfirmationQuestion[],
  { data, answerKey }: DemoPersona,
): QuestionAnswer[] {
  const ids = new Map<string, string>();
  for (const item of data.items)
    for (const a of item.accounts)
      for (const t of a.transactions)
        ids.set(t.sourceId, transactionId(t.accountSourceId, t.sourceId));
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const answerValue = (card: CardAnswer): QuestionAnswer['value'] => {
    if (card.id === 'psychologist-beneficiary') {
      // F.2: care for the holder; the profession is the card's second half (E.3 health_to_confirm).
      const professional = answerKey.expectedFacts.pfDetails.healthExpenses.find(
        (h) => !/^\d/.test(h.cnaeOrProfession),
      );
      return { beneficiary: String(card.answer), profession: professional?.cnaeOrProfession ?? '' };
    }
    return typeof card.answer === 'object'
      ? (card.answer as unknown as Record<string, number>)
      : card.answer;
  };
  const out: QuestionAnswer[] = [];
  for (const card of answerKey.cardAnswers) {
    const txIds = card.transactionIds.map((s) => ids.get(s) ?? s);
    const q =
      questions.find((x) => x.id === card.id) ??
      questions.find((x) => card.transactionIds.length > 0 && sameSet(x.transactionIds, txIds));
    if (q !== undefined) out.push({ questionId: q.id, value: answerValue(card) });
  }
  return out;
}

function sealFinding(persona: string, f: Omit<Finding, 'trace'>): SealFinding {
  return {
    ruleId: f.ruleId,
    type: f.type,
    title: f.title,
    marginalValue12m: f.marginalValue12m,
    range: f.range ?? null,
    href: `/demo/${persona}/achados/${f.ruleId}`,
  };
}

/** Accordion rows: masked label (CPF → mask only; person names and documents redacted, ARCHITECTURE §6.3). */
function txRows(data: PersonaData, result: PipelineResult): Record<string, TxRow> {
  const accounts = data.items.flatMap((i) => i.accounts.map((a) => a.account));
  const source: SourceTransaction[] = data.items.flatMap((i) =>
    i.accounts.flatMap((a) => a.transactions),
  );
  const originals = new Map(source.map((t) => [transactionId(t.accountSourceId, t.sourceId), t]));
  const origin = new Map(result.classifications.map((c) => [c.transactionId, c.origin]));
  const rows: Record<string, TxRow> = {};
  for (const t of normalizeTransactions(accounts, source)) {
    const raw = originals.get(t.id);
    const doc = t.counterparty?.document;
    rows[t.id] = {
      id: t.id,
      date: t.date,
      label:
        doc?.type === 'CPF'
          ? `Pessoa física · ${doc.mask}`
          : redactDescription(raw?.description ?? t.description, t.counterparty ?? undefined),
      amountCents: t.amountCents,
      origin: origin.get(t.id) ?? null,
    };
  }
  return rows;
}

export type DemoFinance =
  | { ok: true; value: FinanceScreenData }
  | { ok: false; reason: 'UNKNOWN_PERSONA' | 'FINANCIAL_VIEW_UNAVAILABLE' };

/** Memoized per persona for the build (both the page and the metadata read it). */
export const demoFinance = cache(async (personaId: string): Promise<DemoFinance> => {
  const persona = PERSONAS[personaId];
  if (persona === undefined) return { ok: false, reason: 'UNKNOWN_PERSONA' };
  const { data } = persona;
  const first = await drain(runAnalysis(input(data), deps(data)));
  const answers = canonicalAnswers(first.questions, persona);
  const runInput = input(data, answers);
  const result = await drain(runAnalysis(runInput, deps(data)));
  const view = financialViewOfRun(
    { ...runInput, transactions: runInput.transactions as SourceTransaction[] },
    result,
  );
  if (!view.ok) return { ok: false, reason: 'FINANCIAL_VIEW_UNAVAILABLE' };
  // D31 (b): one view per combination of "remover repetido" choices, built here because the client cannot run the
  // pipeline. Capped at MAX_SUSPECTS suspects (2^n views); beyond that the extra suspects offer no removal.
  const suspects = [view.value.pj, view.value.pf]
    .flatMap((h) => h?.duplicates ?? [])
    .filter((d) => d.reason === 'same_charge_within_3_days')
    .slice(0, MAX_SUSPECTS)
    .map(duplicateRemovals);
  const variants: Record<string, FinancialView> = { '': view.value };
  for (const ids of exclusionSets(suspects)) {
    if (ids.length === 0) continue;
    const v = financialViewOfRun(
      { ...runInput, transactions: runInput.transactions as SourceTransaction[] },
      result,
      ids,
    );
    if (v.ok) variants[variantKey(ids)] = v.value;
  }
  const findings: Record<string, SealFinding> = {};
  for (const f of result.engineResult?.findings ?? []) findings[f.ruleId] = sealFinding(data.id, f);
  const company = data.company.displayLegalName
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return {
    ok: true,
    value: {
      title: `${company} + ${data.holderDisplayName}`,
      view: view.value,
      variants,
      storageKey: storageKey(data.id),
      findings,
      transactions: txRows(data, result),
      links: { confirm: `/demo/${data.id}/confirmar`, dashboard: `/demo/${data.id}/painel` },
    },
  };
});

import 'server-only';
import type { EngineResult, Facts, Finding } from '@refund/engine';
import { actionRefOf } from '@refund/engine';
import { article, procedure } from '@refund/law';
import type { QuestionAnswer } from '@refund/pipeline';
import { cache } from 'react';
import type { DemoPersonaView } from '@/features/demo/types';
import { txRows } from '@/features/finance/demo-view';
import type { TxRow } from '@/features/finance/types';
import { type ConfirmCard, confirmCards } from '@/features/findings/confirm';
import { type DashboardModel, dashboardModel } from '@/features/findings/model';
import { demoQuestions, runDemoAnalysis } from './analysis.ts';
import { type DemoPersona, demoPersona } from './catalog.ts';
import { personaView } from './view.ts';

// The /demo snapshot for Screens 5–8 (ARCHITECTURE §7.3): the persona's real pipeline run with her card answers,
// drained at build time. Every number on those screens comes from `result` (the engine); this file only selects.

export interface LawExcerpt {
  id: string;
  label: string;
  url: string;
  /** Verbatim text from @refund/law (regulation or procedure excerpt). */
  text: string;
  capturedAt: string;
}

export interface DemoSnapshot {
  persona: DemoPersona;
  view: DemoPersonaView;
  result: EngineResult;
  facts: Facts;
  /** Template explanation per rule (E10), rendered from the trace. */
  explanations: Record<string, string>;
  dashboard: DashboardModel;
  cards: ConfirmCard[];
  personaAnswers: QuestionAnswer[];
  rows: Record<string, TxRow>;
}

/** A LegalRef id (law or procedure) → its verbatim excerpt, for the "§" sheets. */
export function lawExcerpt(id: string): LawExcerpt | null {
  const a = article(id);
  if (a) return { id, label: a.label, url: a.url, text: a.text, capturedAt: a.capturedAt };
  const p = procedure(id);
  if (p) return { id, label: p.label, url: p.url, text: p.text, capturedAt: p.capturedAt };
  const ref = actionRefOf(id);
  return ref ? { id, label: ref.label, url: ref.url, text: '', capturedAt: ref.verifiedAt } : null;
}

/** Every ref id a finding cites: rule metadata, trace steps and action plan (deduplicated, in that order). */
export function refIdsOf(f: Finding): string[] {
  return [
    ...new Set([
      ...f.refs.map((r) => r.id),
      ...f.trace.flatMap((s) => (s.ref ? [s.ref.id] : [])),
      ...f.actionPlan.flatMap((s) => s.refIds),
      ...f.howToReceive.flatMap((h) => h.refIds),
    ]),
  ];
}

export type DemoSnapshotResult =
  | { ok: true; value: DemoSnapshot }
  | { ok: false; reason: 'UNKNOWN_PERSONA' | 'ANALYSIS_UNAVAILABLE' };

export const demoSnapshot = cache(async (id: string): Promise<DemoSnapshotResult> => {
  const persona = demoPersona(id);
  if (!persona) return { ok: false, reason: 'UNKNOWN_PERSONA' };
  const [{ result }, questions] = await Promise.all([
    runDemoAnalysis(persona),
    demoQuestions(persona),
  ]);
  if (result.engineResult === null || result.facts === null)
    return { ok: false, reason: 'ANALYSIS_UNAVAILABLE' };
  const rows = txRows(persona.data, result);
  const explanations = Object.fromEntries(
    Object.entries(result.explanations).map(([ruleId, e]) => [ruleId, e.text]),
  );
  return {
    ok: true,
    value: {
      persona,
      view: personaView(persona),
      result: result.engineResult,
      facts: result.facts,
      explanations,
      dashboard: dashboardModel(result.engineResult, persona.data.analysisDate),
      cards: confirmCards(questions.questions, questions.answers, (ids) => {
        const first = ids.map((t) => rows[t]).find((r) => r !== undefined);
        return first
          ? { date: first.date, label: first.label, amountCents: first.amountCents }
          : null;
      }),
      personaAnswers: questions.answers,
      rows,
    },
  };
});

/** For pages: the snapshot or a thrown error (static generation must fail loudly, never render a wrong number). */
export async function requireSnapshot(id: string): Promise<DemoSnapshot | null> {
  const s = await demoSnapshot(id);
  if (s.ok) return s.value;
  if (s.reason === 'UNKNOWN_PERSONA') return null;
  throw new Error(`demo snapshot unavailable for ${id}: ${s.reason}`);
}

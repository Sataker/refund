// Analysis events (ARCHITECTURE §4.6): the same objects go on the SSE wire (ADR-007).
import type { CivilDate, Finding, Total, Trace } from '@refund/engine';
import type { ExplanationOutput } from './ports.ts';
import type { ConfirmationQuestion } from './types.ts';

export type AnalysisStage = 'normalization' | 'classification' | 'facts' | 'rules' | 'explanation';

export type AnalysisEvent =
  | {
      type: 'start';
      analysisId: string;
      origin: 'live' | 'demo';
      persona?: string;
      accounts: { pf: number; pj: number };
      engineVersion: string;
      parametersVersion: string;
      startedAt: string;
    }
  | {
      type: 'stage';
      stage: AnalysisStage;
      status: 'started' | 'completed';
      label: string;
      progress?: { done: number; total: number };
    }
  | {
      type: 'transaction_sample';
      items: { date: CivilDate; description: string; amountCents: number; holder: 'PF' | 'PJ' }[];
    } // up to 8, masked, for the column that "scrolls"
  | {
      type: 'classification_summary';
      total: number;
      byOrigin: { rule: number; llm: number; user: number };
      pending: number;
      unclassified: number;
    }
  | { type: 'question'; question: ConfirmationQuestion }
  | {
      type: 'facts_summary';
      rbt12Cents: number;
      payroll12Cents: number;
      fatorR: string | null;
      monthsWithData: number;
    }
  | { type: 'finding'; finding: FindingDto; partialTotal: TotalDto }
  | { type: 'alert'; finding: FindingDto } // type 'alert' | 'risk', outside the total
  | { type: 'total'; total: TotalDto }
  | { type: 'explanation'; ruleId: string; text: string; origin: ExplanationOutput['origin'] }
  | {
      type: 'end';
      analysisId: string;
      status: 'completed' | 'awaiting_confirmation';
      durationMs: number;
    }
  | { type: 'error'; code: string; message: string; recoverable: boolean; stage?: string }
  | { type: 'ping' };

/** Serializable DTO (no functions; Cents as number). When unlocked, the whole trace is sent. */
export type FindingDto = Omit<Finding, 'trace'> & {
  id: string;
  explanation: string;
  explanationOrigin: ExplanationOutput['origin'];
  trace: Trace | null;
  traceLocked: boolean; // paywall in the backend (§8.3); the pipeline always sends it unlocked
};
export type TotalDto = Total;

/** One SSE frame (ARCHITECTURE §4.6, wire format): `id` = increasing seq per analysis. */
export function toSseFrame(event: AnalysisEvent, seq: number): string {
  return `id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

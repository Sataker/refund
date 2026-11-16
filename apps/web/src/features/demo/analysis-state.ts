import type { AnalysisEvent, AnalysisStage, FindingDto, TotalDto } from '@refund/pipeline';

// Screen 4 state, folded from the analysis events (ARCHITECTURE §4.6) in arrival order. Pure: the same
// reducer serves the SSE stream of /demo (E12) and of /app (E14). The number never goes back: an error keeps
// what was found (IDENTITY-AND-UI Screen 4, "Error midway").

export type StageStatus = 'todo' | 'active' | 'done';

/** The three stages on screen (script 1): reading, separating PF/PJ, applying the rules. */
export type ScreenStage = 'reading' | 'separating' | 'rules';

export interface AnalysisView {
  status: 'connecting' | 'running' | 'done';
  stages: Record<ScreenStage, StageStatus>;
  accounts: { pf: number; pj: number } | null;
  transactionsRead: number | null;
  sample: Extract<AnalysisEvent, { type: 'transaction_sample' }>['items'];
  /** Savings and recovery (`finding`) and alerts/risks (`alert`), in the order they arrived. */
  cards: { finding: FindingDto; kind: 'finding' | 'alert' }[];
  /** Rule ids already seen (to tick the list of rules in stage 3). */
  rulesSeen: string[];
  /** Counter target: `partialTotal.savings12m` of the last finding (climbs exactly to the total). */
  target: number;
  total: TotalDto | null;
  explanations: Record<string, string>;
  errors: { code: string; message: string; recoverable: boolean; stage?: string }[];
  endStatus: 'completed' | 'awaiting_confirmation' | null;
  lastSeq: number;
}

export const INITIAL_VIEW: AnalysisView = {
  status: 'connecting',
  stages: { reading: 'todo', separating: 'todo', rules: 'todo' },
  accounts: null,
  transactionsRead: null,
  sample: [],
  cards: [],
  rulesSeen: [],
  target: 0,
  total: null,
  explanations: {},
  errors: [],
  endStatus: null,
  lastSeq: 0,
};

const SCREEN_STAGE: Partial<Record<AnalysisStage, ScreenStage>> = {
  normalization: 'reading',
  classification: 'separating',
  facts: 'rules',
  rules: 'rules',
};

function setStage(v: AnalysisView, stage: ScreenStage, status: StageStatus): AnalysisView {
  // A stage never goes back from done (facts and rules share the 3rd line).
  if (v.stages[stage] === 'done' && status !== 'done') return v;
  return { ...v, stages: { ...v.stages, [stage]: status } };
}

export function reduceAnalysis(v: AnalysisView, e: AnalysisEvent, seq: number): AnalysisView {
  if (seq !== 0 && seq <= v.lastSeq) return v; // a reconnection resends what we already have
  const base: AnalysisView = { ...v, lastSeq: seq === 0 ? v.lastSeq : seq };
  switch (e.type) {
    case 'start':
      return setStage({ ...base, status: 'running', accounts: e.accounts }, 'reading', 'active');
    case 'stage': {
      const stage = SCREEN_STAGE[e.stage];
      if (!stage) return base;
      const next =
        e.stage === 'normalization' && e.progress
          ? { ...base, transactionsRead: e.progress.total }
          : base;
      if (e.status === 'started') return setStage(next, stage, 'active');
      // `facts` completing does not end the 3rd line: the rules do.
      return e.stage === 'facts' ? next : setStage(next, stage, 'done');
    }
    case 'transaction_sample':
      return { ...base, sample: e.items };
    case 'finding':
      return {
        ...base,
        cards: [...base.cards, { finding: e.finding, kind: 'finding' }],
        rulesSeen: [...base.rulesSeen, e.finding.ruleId],
        target: Math.max(base.target, e.partialTotal.savings12m),
      };
    case 'alert':
      return {
        ...base,
        cards: [...base.cards, { finding: e.finding, kind: 'alert' }],
        rulesSeen: [...base.rulesSeen, e.finding.ruleId],
      };
    case 'total':
      return { ...base, total: e.total, target: e.total.savings12m };
    case 'explanation':
      return { ...base, explanations: { ...base.explanations, [e.ruleId]: e.text } };
    case 'end':
      return {
        ...setStage(
          setStage(setStage(base, 'reading', 'done'), 'separating', 'done'),
          'rules',
          'done',
        ),
        status: 'done',
        endStatus: e.status,
      };
    case 'error':
      return {
        ...base,
        errors: [
          ...base.errors,
          {
            code: e.code,
            message: e.message,
            recoverable: e.recoverable,
            ...(e.stage === undefined ? {} : { stage: e.stage }),
          },
        ],
      };
    default:
      return base;
  }
}

/** Overall progress (0–100) for the bar under the stages. */
export function progressPercent(v: AnalysisView): number {
  if (v.status === 'done') return 100;
  const s = v.stages;
  if (s.rules === 'active') return Math.min(95, 55 + v.rulesSeen.length * 10);
  if (s.separating === 'done') return 50;
  if (s.separating === 'active') return 35;
  if (s.reading === 'done') return 30;
  if (s.reading === 'active') return 8;
  return 0;
}

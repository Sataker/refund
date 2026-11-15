// Event pacing (ARCHITECTURE §4.4 `Pace`; IDENTITY-AND-UI §4.9, script 1). Only the interval between events
// changes; the calculation is always the real one (REVISAO B9).
import type { AnalysisEvent } from './events.ts';
import type { Pace } from './types.ts';

type Moment =
  | 'normalization_done'
  | 'classification_done'
  | 'question'
  | 'facts_done'
  | 'first_finding'
  | 'finding'
  | 'alert'
  | 'total'
  | 'explanation'
  | 'end'
  | 'other';

/** Script 1 (~8 s): stage 1 ✓ at 1,8 s, stage 2 ✓ at 3,4 s, cards from 3,9 s (1,4 s per counter jump), end 8,6 s. */
const SCRIPTED: Record<Moment, number> = {
  normalization_done: 1800,
  classification_done: 1600,
  question: 0,
  facts_done: 0,
  first_finding: 500,
  finding: 1400,
  alert: 600,
  total: 700,
  explanation: 0,
  end: 700,
  other: 0,
};

const FAST: Record<Moment, number> = {
  normalization_done: 250,
  classification_done: 250,
  question: 0,
  facts_done: 0,
  first_finding: 100,
  finding: 250,
  alert: 100,
  total: 100,
  explanation: 0,
  end: 100,
  other: 0,
};

function momentOf(e: AnalysisEvent, findingsSoFar: number): Moment {
  switch (e.type) {
    case 'stage':
      if (e.status !== 'completed') return 'other';
      if (e.stage === 'normalization') return 'normalization_done';
      if (e.stage === 'classification') return 'classification_done';
      return e.stage === 'facts' ? 'facts_done' : 'other';
    case 'finding':
      return findingsSoFar === 0 ? 'first_finding' : 'finding';
    case 'alert':
    case 'total':
    case 'question':
    case 'explanation':
    case 'end':
      return e.type;
    default:
      return 'other';
  }
}

/** Delay (ms) before emitting `e`. */
export function delayBefore(pace: Pace, e: AnalysisEvent, findingsSoFar: number): number {
  if (pace === 'instant') return 0;
  return (pace === 'scripted' ? SCRIPTED : FAST)[momentOf(e, findingsSoFar)];
}

export const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

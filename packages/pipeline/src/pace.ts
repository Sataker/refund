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
  | 'finding_outside_total'
  | 'alert'
  | 'total'
  | 'explanation'
  | 'end'
  | 'other';

/**
 * Script 1 (~8 s; IDENTITY-AND-UI §4.9): stage 1 ✓ at 1,8 s, stage 2 ✓ at 3,4 s, first card and first R$ at 3,9 s,
 * then 1,4 s per counter jump (`count` token). A card outside the total moves no counter, so it takes the script's
 * 1,0 s (card 3 at 6,3 s); alerts and risks follow 0,3 s apart (the risk card at 6,9 s, "at the end of the list";
 * > the 220 ms card entrance). The number settles at 7,9 s and the run ends at 8,6 s (CTA). Hero with A01:
 * R01 3,9 · R05 5,3 · R05-REC 6,3 · R02 6,6 · A01 6,9 · total 7,9 · end 8,6 (EXECUTION §9, 16/11 A01 row).
 */
const SCRIPTED: Record<Moment, number> = {
  normalization_done: 1800,
  classification_done: 1600,
  question: 0,
  facts_done: 0,
  first_finding: 500,
  finding: 1400,
  finding_outside_total: 1000,
  alert: 300,
  total: 1000,
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
  finding_outside_total: 250,
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
      if (findingsSoFar === 0) return 'first_finding';
      return e.finding.countsInTotal ? 'finding' : 'finding_outside_total';
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

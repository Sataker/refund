import 'server-only';
import { analysisEventsAfter, type Db, findAnalysis } from '@refund/db';
import { type AnalysisEvent, toSseFrame } from '@refund/pipeline';

// The live SSE (ARCHITECTURE §4.6, §4.8; ADR-007): the persisted log, from the event after `Last-Event-ID`. Events the
// browser already rendered (`from`, kept per tab) come back at once so a reload rebuilds the screen; the rest play at a
// human pace (the run itself is instant). Nothing is ever sent twice to the same EventSource: `id` = seq.

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

/** Interval before an event plays, in ms (Screen 4 script: a card lands, the counter climbs, then the next). */
export function delayOf(type: string): number {
  if (type === 'finding' || type === 'alert') return 700;
  if (type === 'stage' || type === 'question' || type === 'total') return 300;
  return 120;
}

const TERMINAL = new Set(['completed', 'awaiting_confirmation', 'error']);

export interface ReplayOptions {
  db: Db;
  analysisId: string;
  /** Last-Event-ID (header) or 0. */
  after: number;
  /** Events up to this seq are sent without pause (already on screen before a reload). */
  instantUntil: number;
  wait: (ms: number) => Promise<void>;
  aborted: () => boolean;
  /** Upper bound of the whole stream (maxDuration 300 s; we stop before). */
  deadlineMs: number;
  now?: () => number;
}

/** Frames to write, in order; ends after the log's last event once the run is over. */
export async function* replayFrames(o: ReplayOptions): AsyncGenerator<string, void, void> {
  const now = o.now ?? Date.now;
  let cursor = o.after;
  for (;;) {
    if (o.aborted() || now() > o.deadlineMs) return;
    // Status first: the run writes its log and its final status in one transaction, so a terminal status read
    // before the log guarantees the log is complete.
    const analysis = await findAnalysis(o.db, o.analysisId);
    if (!analysis) return;
    const done = TERMINAL.has(analysis.status);
    const rows = await analysisEventsAfter(o.db, o.analysisId, cursor);
    for (const row of rows) {
      if (o.aborted()) return;
      if (row.seq > o.instantUntil) await o.wait(delayOf(row.type));
      cursor = row.seq;
      yield toSseFrame(row.payload as AnalysisEvent, row.seq);
    }
    if (done) return;
    if (rows.length === 0) await o.wait(1000); // another instance is running it: poll the log
  }
}

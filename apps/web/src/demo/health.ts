import 'server-only';
import { dashboardModel } from '@/features/findings/model';
import { recordingsComplete, runDemoAnalysis } from './analysis.ts';
import { DEMO_PERSONAS, type DemoPersona } from './catalog.ts';

// The `demo` field of /api/health (ARCHITECTURE §10.2): how many personas /demo carries, whether every AI call it
// makes is recorded, and whether the numbers each screen shows equal the video numbers of the answer key
// (TESTS §6.4 P3, ENGINE-SPEC F.4). Computed once per process: the demo is static data, so it cannot change
// between two calls of the same deployment.

export type VideoNumbersStatus = 'ok' | 'mismatch' | 'unavailable';

export interface DemoHealth {
  personas: number;
  recordingsComplete: boolean;
  videoNumbers: VideoNumbersStatus;
  /** Only when videoNumbers is not ok: which testIds moved (never values; the screens are public anyway). */
  mismatches?: string[];
}

/** The value each video-number testId shows, read from the same engine result the screens render. */
export async function screenNumbers(p: DemoPersona): Promise<Record<string, number | null> | null> {
  const { result } = await runDemoAnalysis(p);
  const engine = result.engineResult;
  if (engine === null) return null;
  const m = dashboardModel(engine, p.data.analysisDate);
  const out: Record<string, number | null> = {
    // The live counter climbs to the `total` event (features/demo/analysis-state.ts).
    'analysis/money-hero': engine.total.savings12m,
    'dashboard/money-hero': m.total,
    'dashboard/regime-total': m.annual,
    'dashboard/recovery-min': m.recoveryRange?.[0] ?? null,
    'dashboard/recovery-max': m.recoveryRange?.[1] ?? null,
  };
  for (const a of m.alerts) out[`dashboard/alert-${a.ruleId}-cost`] = a.cents;
  return out;
}

export async function videoNumbersOf(
  p: DemoPersona,
): Promise<{ status: VideoNumbersStatus; mismatches: string[] }> {
  const shown = await screenNumbers(p);
  if (shown === null) return { status: 'unavailable', mismatches: [] };
  const mismatches = p.videoNumbers.filter((v) => shown[v.testId] !== v.cents).map((v) => v.testId);
  return { status: mismatches.length === 0 ? 'ok' : 'mismatch', mismatches };
}

async function compute(): Promise<DemoHealth> {
  let recorded = true;
  let status: VideoNumbersStatus = 'ok';
  const mismatches: string[] = [];
  for (const p of DEMO_PERSONAS) {
    if (!(await recordingsComplete(p))) recorded = false;
    const v = await videoNumbersOf(p);
    if (v.status === 'unavailable') status = 'unavailable';
    else if (v.status === 'mismatch' && status === 'ok') status = 'mismatch';
    mismatches.push(...v.mismatches.map((id) => `${p.id}:${id}`));
  }
  return {
    personas: DEMO_PERSONAS.length,
    recordingsComplete: recorded,
    videoNumbers: status,
    ...(mismatches.length > 0 ? { mismatches } : {}),
  };
}

let cached: Promise<DemoHealth> | null = null;

export function demoHealth(): Promise<DemoHealth> {
  if (cached === null) {
    cached = compute();
    // A run that throws is not kept: the next call tries again (and health reports it as failed meanwhile).
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

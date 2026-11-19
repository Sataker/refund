import {
  type ActionStep,
  type Actor,
  type Cents,
  type Confidence,
  type EngineResult,
  type Facts,
  type Finding,
  type RecoveryItem,
  sumCents,
} from '@refund/engine';
import { displayTitle } from '@/features/demo/display';
import { URGENT_DAYS, type Urgency } from './text';

export { ACTOR_LABEL, formatCivilDate, URGENT_DAYS, type Urgency, urgencyText } from './text';

// Screens 5–8 view models (IDENTITY-AND-UI §5; ENGINE-SPEC C.9 and C.12). Pure and browser-safe: they SELECT and
// GROUP what the engine returned and never compute a new amount (CLAUDE.md rule 1). The only sums are by holder,
// through the engine's own `sumCents`, over findings the engine already counts in the total.

export type Holder = 'PJ' | 'PF';

/**
 * Where a finding lands (Screen 5 PF/PJ filter and mini-cards). R01 is a PF+PJ optimization, but its saving is the
 * company's DAS (the partner's extra INSS is already netted in the engine), so it sits with the PJ, like the wireframe.
 */
const RULE_HOLDER: Readonly<Record<string, Holder>> = {
  R01: 'PJ',
  R03: 'PJ',
  R05: 'PJ',
  'R05-REC': 'PJ',
  R06: 'PJ',
  'R06-REC': 'PJ',
  A01: 'PJ',
  A02: 'PJ',
  R02: 'PF',
  R04: 'PF',
};

export function holderOf(ruleId: string): Holder {
  return RULE_HOLDER[ruleId] ?? 'PJ';
}

export interface RefView {
  label: string;
  url: string;
}

export interface DashboardFinding {
  ruleId: string;
  type: Finding['type'];
  /** Plain headline (Screen 4/5 wording); the engine's action title stays in `engineTitle`. */
  title: string;
  engineTitle: string;
  cents: number;
  annualRegimeValue: number | null;
  regimeFrom: string | null;
  range: [number, number] | null;
  confidence: Confidence;
  holder: Holder;
  ref: RefView | null;
  /** `howToReceive[0].firstEffect` (Screen 6b: "Primeiro efeito"). */
  firstEffect: string | null;
  deadline: string | null;
  countsInTotal: boolean;
}

export interface DashboardModel {
  /** ENGINE-SPEC C.9: Σ marginalValue12m of the confirmed savings (`total.byConfidence.confirmed`). */
  total: number;
  /**
   * Steady-state line ("e R$ Y por ano a partir de <mês>"). The engine's `annualRegimeSavings` has no confirmed-only
   * split, so it is shown only when nothing is estimated (engine review H1); otherwise null and `annualPending`.
   */
  annual: number | null;
  annualPending: boolean;
  /** "a partir de <mês>": only the regimeFrom of the single counted confirmed finding that has one (no derivation). */
  regimeFrom: string | null;
  /** Savings that are still `estimated`: shown beside the total as a range, never inside it. */
  estimated: number;
  byHolder: Record<Holder, number>;
  /** Savings, ordered by R$ (largest first; ties keep the engine order). */
  savings: DashboardFinding[];
  recovery: DashboardFinding[];
  alerts: DashboardFinding[];
  recoveryRange: [number, number] | null;
  urgency: Urgency | null;
  analysisDate: string;
}

/** C.12.2 / Screen 6b urgency line: `n` = items with daysLeft ≤ 30, `d` = the smallest daysLeft (engine numbers). */
export function urgencyOf(items: readonly RecoveryItem[] | undefined): Urgency | null {
  const urgent = (items ?? []).filter((i) => i.daysLeft <= URGENT_DAYS);
  if (urgent.length === 0) return null;
  return { count: urgent.length, days: Math.min(...urgent.map((i) => i.daysLeft)) };
}

function view(f: Omit<Finding, 'trace'>): DashboardFinding {
  const ref = f.refs[0];
  return {
    ruleId: f.ruleId,
    type: f.type,
    title: displayTitle(f.ruleId, f.title),
    engineTitle: f.title,
    cents: f.marginalValue12m,
    annualRegimeValue: f.annualRegimeValue ?? null,
    regimeFrom: f.regimeFrom ?? null,
    range: f.range ?? null,
    confidence: f.confidence,
    holder: holderOf(f.ruleId),
    ref: ref ? { label: ref.label, url: ref.url } : null,
    firstEffect: f.howToReceive.find((h) => h.firstEffect !== undefined)?.firstEffect ?? null,
    deadline: f.deadline ?? null,
    countsInTotal: f.countsInTotal,
  };
}

export function dashboardModel(result: EngineResult, analysisDate: string): DashboardModel {
  const savings = result.findings
    .filter((f) => f.type === 'savings')
    .map((f, i) => ({ f: view(f), i }))
    .sort((a, b) => b.f.cents - a.f.cents || a.i - b.i)
    .map((x) => x.f);
  const counted = savings.filter((f) => f.countsInTotal && f.confidence === 'confirmed');
  const byHolder = (h: Holder): number =>
    sumCents(counted.filter((f) => f.holder === h).map((f) => f.cents as Cents));
  const withRegime = counted.filter((f) => f.regimeFrom !== null);
  const regimeFrom = withRegime.length === 1 ? (withRegime[0]?.regimeFrom ?? null) : null;
  const annualPending = result.total.byConfidence.estimated > 0;
  const recoveryFindings = result.findings.filter((f) => f.type === 'recovery');
  const urgency = urgencyOf(recoveryFindings.flatMap((f) => f.recoveryItems ?? []));
  return {
    total: result.total.byConfidence.confirmed,
    annual: annualPending ? null : result.total.annualRegimeSavings,
    annualPending,
    regimeFrom,
    estimated: result.total.byConfidence.estimated,
    byHolder: { PJ: byHolder('PJ'), PF: byHolder('PF') },
    savings,
    recovery: recoveryFindings.map(view),
    alerts: result.findings.filter((f) => f.type === 'alert' || f.type === 'risk').map(view),
    recoveryRange: result.total.recoveryRange,
    urgency,
    analysisDate,
  };
}

// ---------- Screen 6b: action plan ----------

const ACTOR_ORDER: readonly Actor[] = ['you', 'accountant', 'you_or_accountant', 'lawyer'];

export interface ActorGroup {
  who: Actor;
  steps: { ruleId: string; title: string; step: ActionStep }[];
}

/** Screen 8 "Plano de ação": every finding's steps grouped by who does them, each group in the engine order. */
export function stepsByActor(
  findings: readonly Pick<Finding, 'ruleId' | 'title' | 'actionPlan'>[],
) {
  const groups: ActorGroup[] = [];
  for (const who of ACTOR_ORDER) {
    const steps = findings.flatMap((f) =>
      [...f.actionPlan]
        .sort((a, b) => a.order - b.order)
        .filter((s) => s.who === who)
        .map((step) => ({ ruleId: f.ruleId, title: displayTitle(f.ruleId, f.title), step })),
    );
    if (steps.length > 0) groups.push({ who, steps });
  }
  return groups;
}

// ---------- Screen 6: trace numbers → source transactions ----------

type FactPath = 'monthlyRevenue' | 'monthlyPayroll';

/**
 * Which facts back a trace step's number (D7: "click a number in the trace → its source transactions"). The ids are
 * the facts' own provenance (`Provenance.transactionIds`), so the list is exactly what the engine read.
 */
const STEP_SOURCES: readonly { match: RegExp; facts: readonly FactPath[] }[] = [
  // Only steps whose result IS the sum of those transactions (engine review L2).
  { match: /^R01\.RBT12_REGIME$/, facts: ['monthlyRevenue'] },
  { match: /^R01\.FS12_WITHOUT_PRO_LABORE$/, facts: ['monthlyPayroll'] },
];

function provenanceIds(facts: Facts, path: FactPath): string[] {
  return facts[path].provenance.transactionIds ?? [];
}

/** stepId → the transaction ids behind it (only steps with at least one id). */
export function traceSources(
  trace: readonly Pick<Finding['trace'][number], 'id' | 'inputs'>[],
  facts: Facts,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const step of trace) {
    // A step that names its own transactions (A01, one per merchant) lists exactly those.
    const own = step.inputs.transactionIds?.value;
    if (typeof own === 'string' && own !== '') {
      out[step.id] = own.split(',').filter((x) => x !== '');
      continue;
    }
    const rule = STEP_SOURCES.find((s) => s.match.test(step.id));
    if (!rule) continue;
    const ids = [...new Set(rule.facts.flatMap((p) => provenanceIds(facts, p)))];
    if (ids.length > 0) out[step.id] = ids;
  }
  return out;
}

// ---------- Screen 6: the pró-labore simulator (D8) ----------

/**
 * The slider moves the engine's own assumption `fatorRMargin` (ENGINE-SPEC D.1, D13: the safety margin above 28%);
 * the engine answers with the pró-labore P* and every value. Rates as decimal strings, 0 to 5 p.p. in 0,25 p.p.
 */
export const MARGIN_STEPS: readonly string[] = [
  '0',
  '0.0025',
  '0.005',
  '0.0075',
  '0.01',
  '0.0125',
  '0.015',
  '0.0175',
  '0.02',
  '0.0225',
  '0.025',
  '0.0275',
  '0.03',
  '0.0325',
  '0.035',
  '0.0375',
  '0.04',
  '0.0425',
  '0.045',
  '0.0475',
  '0.05',
];

/** D13 default (ENGINE-SPEC C.2 `fatorRMargin` '0.01'), when the facts carry no user value. */
export const DEFAULT_MARGIN = '0.01';

export function marginOf(facts: Facts): string {
  const v = facts.assumptions.fatorRMargin?.value;
  return typeof v === 'string' ? v : DEFAULT_MARGIN;
}

export interface ProLaborePoint {
  /** P* the engine recommends (trace `R01.P_STAR`). */
  target: number;
  /** P0 today (input `currentProLabore` of the same step). */
  current: number;
  /** R01's 12-month value. */
  value: number;
  /** R01's steady-state value. */
  annual: number | null;
  /** R01's regimeFrom: the first PA in the steady-state anexo (D32 "a partir de"). */
  regimeFrom: string | null;
  total: number;
}

/** Reads the simulator numbers out of an engine result (null when R01 did not fire). */
export function proLaborePoint(result: EngineResult): ProLaborePoint | null {
  const r01 = result.findings.find((f) => f.ruleId === 'R01');
  const step = r01?.trace.find((s) => s.id === 'R01.P_STAR');
  if (!r01 || !step || typeof step.result.value !== 'number') return null;
  const current = step.inputs.currentProLabore?.value;
  return {
    target: step.result.value,
    current: typeof current === 'number' ? current : step.result.value,
    value: r01.marginalValue12m,
    annual: r01.annualRegimeValue ?? null,
    regimeFrom: r01.regimeFrom ?? null,
    total: result.total.savings12m,
  };
}

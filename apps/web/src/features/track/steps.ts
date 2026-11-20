// First-access track (decision D19, 14/11; IDENTITY-AND-UI §5 "First-access track"; ARCHITECTURE §13).
// Pure and serializable: the server derives the progress from the database and both the pages and the
// timeline read it. One question or one action per step; conditional steps are skipped silently.
import type { ProfileAnswers, RevenueBracket } from '@refund/engine';

export const STEPS = [
  'cnpj',
  'confirmar-empresa',
  'faturamento',
  'funcionarios',
  'exterior',
  'estimativa',
  'permissoes',
  'conta-pj',
  'conta-pf',
] as const;
export type Step = (typeof STEPS)[number];

export const STAGES = [
  { id: 1, name: 'Sua empresa', steps: ['cnpj', 'confirmar-empresa'] },
  { id: 2, name: 'Seu perfil', steps: ['faturamento', 'funcionarios', 'exterior', 'estimativa'] },
  { id: 3, name: 'Suas contas', steps: ['permissoes', 'conta-pj', 'conta-pf'] },
  // Screen 4 (live analysis) is the 4th stage; its route arrives with E14.
  { id: 4, name: 'Sua análise', steps: [] },
] as const satisfies readonly { id: number; name: string; steps: readonly Step[] }[];

export type ConnectionStatus = 'pending' | 'syncing' | 'active' | 'error' | 'revoked' | 'expired';

/** UI label of `connection_status` (TESTS A2 says "ativa": the label; the enum stays `active`). */
export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  pending: 'Pendente',
  syncing: 'Sincronizando',
  active: 'Ativa',
  error: 'Com erro',
  revoked: 'Revogada',
  expired: 'Expirada',
};

export interface ConnectionSummary {
  id: string;
  provider: 'pluggy' | 'persona' | 'replay';
  status: ConnectionStatus;
  connectorName: string | null;
  transactions: number;
}

export interface TrackProgress {
  /**
   * `outOfScope` (H3): the regime is not Simples nor MEI; the track stops at `confirmar-empresa` and never reaches the
   * consent and the bank steps. `activityOutOfScope`: the CNAE is outside the verified table; the track stops at
   * `estimativa` the same way.
   */
  company: {
    displayName: string;
    confirmed: boolean;
    outOfScope?: boolean;
    activityOutOfScope?: boolean;
  } | null;
  /** ENGINE-SPEC C.11.1: which optional questions apply to this company. */
  questions: { employees: boolean; abroad: boolean } | null;
  answers: Partial<ProfileAnswers>;
  estimateSeen: boolean;
  consented: boolean;
  pj: ConnectionSummary | null;
  pf: ConnectionSummary | null;
  pfSkipped: boolean;
}

export const EMPTY_PROGRESS: TrackProgress = {
  company: null,
  questions: null,
  answers: {},
  estimateSeen: false,
  consented: false,
  pj: null,
  pf: null,
  pfSkipped: false,
};

export function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

/** A conditional step that does not apply is skipped (ARCHITECTURE §13). */
export function applies(step: Step, p: TrackProgress): boolean {
  if (step === 'funcionarios') return p.questions?.employees === true;
  if (step === 'exterior') return p.questions?.abroad === true;
  return true;
}

export function isDone(step: Step, p: TrackProgress): boolean {
  switch (step) {
    case 'cnpj':
      return p.company !== null;
    case 'confirmar-empresa':
      return p.company?.confirmed === true && p.company.outOfScope !== true;
    case 'faturamento':
      return p.answers.monthlyRevenueBracket !== undefined;
    case 'funcionarios':
      return p.answers.hasEmployees !== undefined;
    case 'exterior':
      return p.answers.receivesFromAbroad !== undefined;
    case 'estimativa':
      return p.estimateSeen && p.company?.activityOutOfScope !== true;
    case 'permissoes':
      return p.consented;
    case 'conta-pj':
      return p.pj?.status === 'active';
    case 'conta-pf':
      return p.pf?.status === 'active' || p.pfSkipped;
  }
}

export function applicableSteps(p: TrackProgress): Step[] {
  return STEPS.filter((s) => applies(s, p));
}

/** The first applicable step not done yet, or 'done' when the track is over (the shell unlocks). */
export function currentStep(p: TrackProgress): Step | 'done' {
  return applicableSteps(p).find((s) => !isDone(s, p)) ?? 'done';
}

export type StepAccess = { kind: 'render' } | { kind: 'redirect'; to: Step | 'done' };

/**
 * Whether a step URL renders: completed steps can be revisited to correct an answer; a future step or a
 * skipped conditional step leads to the right one. Nothing here throws: unknown steps are the page's 404.
 */
export function access(step: Step, p: TrackProgress): StepAccess {
  const current = currentStep(p);
  if (!applies(step, p)) {
    const after = STEPS.slice(STEPS.indexOf(step) + 1).find((s) => applies(s, p));
    const target =
      after && (current === 'done' || order(after) <= order(current)) ? after : current;
    return { kind: 'redirect', to: target };
  }
  if (current !== 'done' && order(step) > order(current)) return { kind: 'redirect', to: current };
  return { kind: 'render' };
}

function order(step: Step): number {
  return STEPS.indexOf(step);
}

/**
 * Where to go after answering `step`: the following applicable step (so a corrected answer walks the
 * user forward through what it may change, e.g. the estimate), never past the current step.
 */
export function nextAfter(step: Step, p: TrackProgress): Step | 'done' {
  const current = currentStep(p);
  const following = STEPS.slice(order(step) + 1).find((s) => applies(s, p));
  if (!following) return current;
  return current === 'done' || order(following) <= order(current) ? following : current;
}

/** The applicable step before this one, for the ← button (null on the first step). */
export function previousStep(step: Step, p: TrackProgress): Step | null {
  const list = applicableSteps(p);
  const i = list.indexOf(step);
  return i > 0 ? (list[i - 1] ?? null) : null;
}

export function stageOf(step: Step): (typeof STAGES)[number] {
  return STAGES.find((s) => (s.steps as readonly Step[]).includes(step)) ?? STAGES[0];
}

export function stepPath(step: Step | 'done'): string {
  return step === 'done' ? '/app' : `/app/comecar/${step}`;
}

// ---------- Answers (ENGINE-SPEC C.11.1, C.11.2, C.11.7) ----------

export const REVENUE_OPTIONS: readonly { value: RevenueBracket; label: string; short: string }[] = [
  { value: 'up_to_15k', label: 'Até R$ 15 mil', short: 'até R$ 15 mil/mês' },
  { value: 'from_15k_to_30k', label: 'R$ 15 mil a 30 mil', short: 'R$ 15 a 30 mil/mês' },
  { value: 'from_30k_to_60k', label: 'R$ 30 mil a 60 mil', short: 'R$ 30 a 60 mil/mês' },
  { value: 'from_60k_to_150k', label: 'R$ 60 mil a 150 mil', short: 'R$ 60 a 150 mil/mês' },
  { value: 'from_150k_to_300k', label: 'R$ 150 mil a 300 mil', short: 'R$ 150 a 300 mil/mês' },
  { value: 'from_300k_to_400k', label: 'R$ 300 mil a 400 mil', short: 'R$ 300 a 400 mil/mês' },
  { value: 'above_400k', label: 'Acima de R$ 400 mil', short: 'acima de R$ 400 mil/mês' },
  { value: 'dont_know', label: 'Não sei', short: 'faturamento: não sei' },
];

export const EMPLOYEES_OPTIONS: readonly {
  value: ProfileAnswers['hasEmployees'];
  label: string;
  short: string;
}[] = [
  { value: 'yes', label: 'Sim', short: 'com funcionários' },
  { value: 'no', label: 'Não', short: 'sem funcionários' },
  { value: 'dont_know', label: 'Não sei', short: 'funcionários: não sei' },
];

export const ABROAD_OPTIONS: readonly {
  value: ProfileAnswers['receivesFromAbroad'];
  label: string;
  short: string;
}[] = [
  { value: 'no', label: 'Não', short: 'sem receita do exterior' },
  { value: 'less_than_half', label: 'Sim, menos da metade', short: 'exterior: menos da metade' },
  { value: 'half_or_more', label: 'Sim, metade ou mais', short: 'exterior: metade ou mais' },
  { value: 'dont_know', label: 'Não sei', short: 'exterior: não sei' },
];

/** Summarized answer shown next to a completed step in the timeline ("✓ R$ 30 a 60 mil/mês"). */
export function stepSummary(step: Step, p: TrackProgress): string | null {
  switch (step) {
    case 'cnpj':
      return null;
    case 'confirmar-empresa':
      return p.company?.confirmed ? p.company.displayName : null;
    case 'faturamento':
      return (
        REVENUE_OPTIONS.find((o) => o.value === p.answers.monthlyRevenueBracket)?.short ?? null
      );
    case 'funcionarios':
      return EMPLOYEES_OPTIONS.find((o) => o.value === p.answers.hasEmployees)?.short ?? null;
    case 'exterior':
      return ABROAD_OPTIONS.find((o) => o.value === p.answers.receivesFromAbroad)?.short ?? null;
    case 'estimativa':
      return p.estimateSeen ? 'estimativa vista' : null;
    case 'permissoes':
      return p.consented ? 'consentimento dado' : null;
    case 'conta-pj':
      return p.pj?.status === 'active' ? 'conta PJ conectada' : null;
    case 'conta-pf':
      if (p.pf?.status === 'active') return 'conta PF conectada';
      return p.pfSkipped ? 'só a PJ' : null;
  }
}

/** Short name of each step for the desktop timeline. */
export const STEP_LABEL: Record<Step, string> = {
  cnpj: 'CNPJ',
  'confirmar-empresa': 'Confirmar empresa',
  faturamento: 'Faturamento',
  funcionarios: 'Funcionários',
  exterior: 'Exterior',
  estimativa: 'Estimativa',
  permissoes: 'Permissões',
  'conta-pj': 'Conta da empresa',
  'conta-pf': 'Conta pessoal',
};

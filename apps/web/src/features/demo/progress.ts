import { type DemoTrackState, toQuery } from '@/demo/answers';
import { STEPS, type Step, type TrackProgress } from '@/features/track/steps';
import type { DemoPersonaView } from './types';

// Track progress on /demo: the steps before the one on screen are done, with the answers the visitor kept
// or changed (they come from the URL, never from a server). Shared by the static pages and the client.

export function demoProgress(
  step: Step | 'analysis',
  s: DemoTrackState,
  p: DemoPersonaView,
): TrackProgress {
  const at = step === 'analysis' ? STEPS.length : STEPS.indexOf(step);
  const past = (x: Step) => STEPS.indexOf(x) < at;
  const connection = (holder: 'PJ' | 'PF') => ({
    id: `demo-${holder}`,
    provider: 'persona' as const,
    status: 'active' as const,
    connectorName: p.accounts[holder].bank,
    transactions: p.accounts[holder].transactions,
  });
  const answers: TrackProgress['answers'] = {};
  if (past('faturamento')) answers.monthlyRevenueBracket = s.answers.monthlyRevenueBracket;
  if (past('funcionarios')) answers.hasEmployees = s.answers.hasEmployees;
  if (past('exterior')) answers.receivesFromAbroad = s.answers.receivesFromAbroad;
  return {
    company: past('cnpj')
      ? { displayName: p.companyName, confirmed: past('confirmar-empresa') }
      : null,
    questions: p.questions,
    answers,
    estimateSeen: past('estimativa'),
    consented: past('permissoes'),
    pj: past('conta-pj') ? connection('PJ') : null,
    pf: past('conta-pf') && !s.pfSkipped ? connection('PF') : null,
    pfSkipped: past('conta-pf') && s.pfSkipped,
  };
}

export const demoBase = (persona: string) => `/demo/${persona}`;

export function demoStepHref(persona: string, step: Step | 'analysis', s: DemoTrackState): string {
  const path = step === 'analysis' ? 'analise' : `comecar/${step}`;
  return `${demoBase(persona)}/${path}?${toQuery(s)}`;
}

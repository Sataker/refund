import { describe, expect, it } from 'vitest';
import {
  access,
  applicableSteps,
  currentStep,
  EMPTY_PROGRESS,
  nextAfter,
  previousStep,
  stageOf,
  stepSummary,
  type TrackProgress,
} from './steps.ts';

// First-access track (D19; ARCHITECTURE §13): order, conditional steps, shell lock, corrections.

const company = { displayName: 'Marina Dev', confirmed: true };
const both = { employees: true, abroad: true };
const active = {
  id: 'c',
  provider: 'persona' as const,
  status: 'active' as const,
  connectorName: null,
  transactions: 1,
};

function progress(over: Partial<TrackProgress>): TrackProgress {
  return { ...EMPTY_PROGRESS, ...over };
}

describe('track steps', () => {
  it('starts at cnpj and walks the 9 steps in order when every question applies', () => {
    let p = progress({});
    expect(currentStep(p)).toBe('cnpj');
    p = progress({ company: { ...company, confirmed: false }, questions: both });
    expect(currentStep(p)).toBe('confirmar-empresa');
    p = progress({ company, questions: both });
    expect(applicableSteps(p)).toHaveLength(9);
    expect(currentStep(p)).toBe('faturamento');
    p = progress({
      company,
      questions: both,
      answers: {
        monthlyRevenueBracket: 'from_30k_to_60k',
        hasEmployees: 'yes',
        receivesFromAbroad: 'no',
      },
      estimateSeen: true,
      consented: true,
      pj: active,
    });
    expect(currentStep(p)).toBe('conta-pf');
    expect(currentStep({ ...p, pfSkipped: true })).toBe('done');
    expect(currentStep({ ...p, pf: active })).toBe('done');
    expect(currentStep({ ...p, pj: { ...active, status: 'syncing' } })).toBe('conta-pj');
  });

  it('skips the optional questions that do not apply (silently)', () => {
    const p = progress({
      company,
      questions: { employees: false, abroad: false },
      answers: { monthlyRevenueBracket: 'from_60k_to_150k' },
    });
    expect(applicableSteps(p)).not.toContain('funcionarios');
    expect(applicableSteps(p)).not.toContain('exterior');
    expect(currentStep(p)).toBe('estimativa');
    expect(access('funcionarios', p)).toEqual({ kind: 'redirect', to: 'estimativa' });
    expect(nextAfter('faturamento', p)).toBe('estimativa');
    expect(previousStep('estimativa', p)).toBe('faturamento');
  });

  it('locks the future: a later step redirects to the current one; done steps stay open', () => {
    const p = progress({
      company,
      questions: both,
      answers: { monthlyRevenueBracket: 'up_to_15k' },
    });
    expect(access('conta-pj', p)).toEqual({ kind: 'redirect', to: 'funcionarios' });
    expect(access('faturamento', p)).toEqual({ kind: 'render' });
    expect(access('funcionarios', p)).toEqual({ kind: 'render' });
    expect(previousStep('cnpj', p)).toBeNull();
  });

  it('after correcting an earlier answer the user walks forward, never past the current step', () => {
    const p = progress({
      company,
      questions: both,
      answers: { monthlyRevenueBracket: 'up_to_15k', hasEmployees: 'no', receivesFromAbroad: 'no' },
      estimateSeen: true,
    });
    expect(nextAfter('faturamento', p)).toBe('funcionarios');
    const early = progress({
      company,
      questions: both,
      answers: { monthlyRevenueBracket: 'up_to_15k' },
    });
    expect(nextAfter('confirmar-empresa', early)).toBe('faturamento');
    const done = { ...p, consented: true, pj: active, pfSkipped: true };
    expect(nextAfter('conta-pf', done)).toBe('done');
  });

  it('stages and summaries for the timeline (never "pergunta 3 de 9")', () => {
    expect(stageOf('estimativa').name).toBe('Seu perfil');
    expect(stageOf('conta-pf').id).toBe(3);
    const p = progress({
      company,
      questions: both,
      answers: { monthlyRevenueBracket: 'from_30k_to_60k' },
    });
    expect(stepSummary('confirmar-empresa', p)).toBe('Marina Dev');
    expect(stepSummary('faturamento', p)).toBe('R$ 30 a 60 mil/mês');
    expect(stepSummary('funcionarios', p)).toBeNull();
  });
});

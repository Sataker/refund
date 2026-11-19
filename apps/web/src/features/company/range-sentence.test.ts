import {
  type ApplicableRule,
  type Cents,
  estimateByProfile,
  type ProfileAnswers,
} from '@refund/engine';
import { describe, expect, it } from 'vitest';
import { demoPersona } from '@/demo/catalog.ts';
import { toPublicProfile } from '@/server/company/profile.ts';
import { rangedRuleCount, rangeLead } from './range-sentence.ts';

// ENGINE-SPEC C.11.7 (D33): k = the listed rules that carry a range, as a word; "vale" when k = 1; alerts never count.

const ref = { id: 'x', label: 'x', url: 'https://x', verifiedAt: '2026-11-19' };
const rule = (ruleId: ApplicableRule['ruleId'], range?: [number, number]): ApplicableRule => ({
  ruleId,
  title: ruleId,
  why: ruleId,
  ref,
  ...(range ? { range: range as [Cents, Cents] } : {}),
});

describe('D33: Screen 1 range sentence', () => {
  it('k = 1: "uma dessas regras vale"; the R02 alert does not count', () => {
    const rules = [rule('R01', [100000, 900000]), rule('R05'), rule('R02')];
    expect(rangedRuleCount(rules)).toBe(1);
    expect(rangeLead(rules)).toBe('Com o seu perfil, uma dessas regras vale');
  });

  it('k = 2: "duas dessas regras valem"', () => {
    const rules = [rule('R01', [1, 2]), rule('R05', [3, 4]), rule('R02')];
    expect(rangeLead(rules)).toBe('Com o seu perfil, duas dessas regras valem');
  });

  it('k = 3: "três dessas regras valem"; an alert with a range still never counts', () => {
    const rules = [
      rule('R01', [1, 2]),
      rule('R05', [3, 4]),
      rule('R06', [5, 6]),
      rule('R03', [7, 8]),
      rule('R02', [9, 10]),
    ];
    expect(rangedRuleCount(rules)).toBe(3);
    expect(rangeLead(rules)).toBe('Com o seu perfil, três dessas regras valem');
  });

  it('derives k from the engine estimate: hero answers give "duas … valem"; R$ 15–30 mil, no staff, no abroad gives "uma … vale"', () => {
    const hero = demoPersona('dev-exportador');
    if (!hero) throw new Error('hero');
    const at = (a: ProfileAnswers) => {
      const r = estimateByProfile(toPublicProfile(hero.data.company), a, {
        analysisDate: hero.data.analysisDate,
      });
      return r.ok ? r.value : undefined;
    };
    const e = at(hero.profileAnswers);
    expect(e?.type).toBe('range');
    expect(e?.rules.map((r) => r.ruleId)).toContain('R02');
    expect(rangeLead(e?.rules ?? [])).toBe('Com o seu perfil, duas dessas regras valem');
    const noAbroad = at({
      monthlyRevenueBracket: 'from_15k_to_30k',
      hasEmployees: 'no',
      receivesFromAbroad: 'no',
    });
    expect(noAbroad?.type).toBe('range');
    expect(rangeLead(noAbroad?.rules ?? [])).toBe('Com o seu perfil, uma dessas regras vale');
  });
});

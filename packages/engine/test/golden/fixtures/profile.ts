// Profile-based estimate fixtures (ENGINE-SPEC C.11.10). The hero's public CNPJ data is COPIED from
// packages/personas/data/dev-exportador.json#company (6201-5/01, Simples, EPP, ATIVA, SP, opened 2019-03-11):
// engine tests cannot import @refund/personas (no cycles, ARCHITECTURE §3.3).
import type { ProfileAnswers, PublicProfile, RevenueBracket } from '../../../src/types.ts';

export const HERO_PROFILE: PublicProfile = {
  cnpj: 'RFDEV001000158',
  primaryCnae: '6201-5/01',
  isActive: true,
  optedIntoSimples: true,
  optedIntoMei: false,
  size: 'EPP',
  activityStartDate: '2019-03-11',
  uf: 'SP',
};

/** The hero's own answers (C.11.10): employees yes, half or more from abroad, 30 to 60 mil per month. */
export const HERO_ANSWERS: ProfileAnswers = {
  monthlyRevenueBracket: 'from_30k_to_60k',
  hasEmployees: 'yes',
  receivesFromAbroad: 'half_or_more',
};

const BRACKETS: RevenueBracket[] = [
  'up_to_15k',
  'from_15k_to_30k',
  'from_30k_to_60k',
  'from_60k_to_150k',
  'from_150k_to_300k',
  'from_300k_to_400k',
  'above_400k',
  'dont_know',
];
const EMPLOYEES: ProfileAnswers['hasEmployees'][] = ['yes', 'no', 'dont_know'];
const ABROAD: ProfileAnswers['receivesFromAbroad'][] = [
  'no',
  'less_than_half',
  'half_or_more',
  'dont_know',
];

/** The 96 answer combinations (8 × 3 × 4, C.11.8), in a fixed order. */
export function* allAnswers(): Generator<ProfileAnswers> {
  for (const monthlyRevenueBracket of BRACKETS)
    for (const hasEmployees of EMPLOYEES)
      for (const receivesFromAbroad of ABROAD)
        yield { monthlyRevenueBracket, hasEmployees, receivesFromAbroad };
}

// Reference index (ARCHITECTURE §3.1 `ref-index.ts`, §4.2 `rulesByRef`; ADR "law changed"): which rules each legal
// reference feeds, so a change to a provision in @refund/law marks the right findings as outdated. A rule depends on
// the provisions in its own metadata AND on those behind the parameters it reads (e.g. Lei 15.191 → the IR table →
// R01 and R04).
import { ALL_PARAMETERS, legalRefOf } from './parameters/index.ts';
import type { ParameterKey } from './parameters/types.ts';
import { A01_REFS, A02_REFS } from './rules/alerts.ts';
import { R01_REFS } from './rules/r01.ts';
import { R02_REFS } from './rules/r02.ts';
import { R03_REFS } from './rules/r03.ts';
import { R04_REFS } from './rules/r04.ts';
import { R05_REFS, REC_REFS } from './rules/r05.ts';
import { R06_REFS } from './rules/r06.ts';
import type { LegalRef } from './types.ts';

export type RuleId = 'R01' | 'R05' | 'R06' | 'R04' | 'R05-REC' | 'R02' | 'R03' | 'A01' | 'A02';

/** The `Finding.refs` of each rule (its metadata, ENGINE-SPEC D). */
export const RULE_REFS: Record<RuleId, readonly LegalRef[]> = {
  R01: R01_REFS,
  R05: R05_REFS,
  R06: R06_REFS,
  R04: R04_REFS,
  'R05-REC': REC_REFS,
  R02: R02_REFS,
  R03: R03_REFS,
  A01: A01_REFS,
  A02: A02_REFS,
};

const SIMPLES_DAS: ParameterKey[] = [
  'simples.anexo.I',
  'simples.anexo.III',
  'simples.anexo.V',
  'simples.effectiveRate',
  'simples.calculation',
  'simples.rbt12.window',
  'simples.rbt12.byMarket',
  'simples.startOfActivity',
];
const PF_COST: ParameterKey[] = [
  'inss.ceiling',
  'inss.proLabore.rate',
  'inss.cpp.rate',
  'irpf.annual.table',
  'irpf.annual.reduction',
  'irpf.annual.simplifiedDiscount',
  'irpf.annual.dependent',
  'irpf.annual.education',
];

/** The parameters each rule reads (C.3 primitives behind its cost, D.x pseudocode). */
export const RULE_PARAMETERS: Record<RuleId, readonly ParameterKey[]> = {
  R01: [
    ...SIMPLES_DAS,
    ...PF_COST,
    'simples.fatorR.limit',
    'simples.fatorR.formula',
    'simples.fatorR.payroll',
    'simples.fatorR.window',
    'minimumWage',
    'irpf.monthly.table',
    'irpf.monthly.simplifiedDiscount',
    'irpf.monthly.reduction',
  ],
  R05: [...SIMPLES_DAS, ...PF_COST, 'simples.export.exclude', 'simples.export.concept'],
  R06: [...SIMPLES_DAS, ...PF_COST, 'simples.monofasico.exclude'],
  R04: [...PF_COST, 'irpf.pgbl.limit', 'irpf.pgbl.referenceRedemptionRate'],
  'R05-REC': [
    ...SIMPLES_DAS,
    'simples.export.exclude',
    'statuteOfLimitations.years',
    'simples.das.dueDate',
    'simples.refund.claimFromMonths',
    'calendar.nationalHolidays',
  ],
  R02: [
    'dividends.withholding',
    'dividends.refund',
    'dividends.darf',
    'dividends.transition2025',
    'irpfm.threshold',
  ],
  R03: ['mei.limit', 'mei.excess', 'simples.limits', 'simples.excess', 'simples.anexo.I'],
  A01: [],
  A02: ['minimumWage'],
};

/** Every LegalRef behind a rule: its metadata plus the refs of every period of the parameters it reads. */
export function refsOfRule(ruleId: RuleId): LegalRef[] {
  const out = new Map<string, LegalRef>();
  for (const ref of RULE_REFS[ruleId]) out.set(ref.id, ref);
  const keys = new Set<ParameterKey>(RULE_PARAMETERS[ruleId]);
  for (const entry of ALL_PARAMETERS) {
    if (!keys.has(entry.key)) continue;
    const ref = legalRefOf(entry);
    if (ref !== undefined && !out.has(ref.id)) out.set(ref.id, ref);
  }
  return [...out.values()];
}

/** LegalRef.id → rules that depend on it (ARCHITECTURE §4.2; the "law changed" flow). */
export const rulesByRef: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const ruleId of Object.keys(RULE_REFS) as RuleId[]) {
    for (const ref of refsOfRule(ruleId)) {
      const list = out[ref.id] ?? [];
      if (!list.includes(ruleId)) list.push(ruleId);
      out[ref.id] = list;
    }
  }
  return out;
})();

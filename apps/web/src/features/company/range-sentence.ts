import type { ApplicableRule } from '@refund/engine';

// ENGINE-SPEC C.11.7 (D33, 19/11): "Com o seu perfil, {k} dessas regras {valem} de R$ {min} mil a R$ {max} mil por
// ano a menos de imposto." k counts only the listed rules that carry a range, as a feminine word ("regras"); the
// alerts of C.11.6 (R02, R03) never count, even if one ever came with a range.

const ALERT_RULES: ReadonlySet<ApplicableRule['ruleId']> = new Set(['R02', 'R03']);

const FEMININE_NUMBER: readonly string[] = [
  'nenhuma',
  'uma',
  'duas',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
];

export function rangedRuleCount(rules: readonly ApplicableRule[]): number {
  return rules.filter((r) => r.range !== undefined && !ALERT_RULES.has(r.ruleId)).length;
}

/**
 * The lead of the range sentence, up to the verb: "Com o seu perfil, duas dessas regras valem". Without any ranged
 * rule (the engine never returns a range then) it keeps the previous wording rather than saying "nenhuma".
 */
export function rangeLead(rules: readonly ApplicableRule[]): string {
  const k = rangedRuleCount(rules);
  if (k === 0) return 'Com o seu perfil, estas regras valem';
  const word = FEMININE_NUMBER[k] ?? String(k);
  return `Com o seu perfil, ${word} dessas regras ${k === 1 ? 'vale' : 'valem'}`;
}

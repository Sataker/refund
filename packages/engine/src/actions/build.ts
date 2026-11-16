// Builds each finding's C.12 action plan from the catalog (ENGINE-SPEC C.12; EXECUTION E8b): evaluates `appliesIf`,
// resolves the `{placeholders}` from the finding's own trace, and computes every date with calendar.ts. Runs in
// analyze() and recalculate() after the combined scenario; it changes no number of the finding.
import {
  dasDueDate,
  esocialDueDate,
  inssDueDate,
  secondDecendioLastBusinessDay,
} from '../calendar.ts';
import { EngineError } from '../errors.ts';
import { param } from '../parameters/index.ts';
import { PROCEDURE_REFS } from '../parameters/legal-refs.ts';
import { formatBrl } from '../rules/common.ts';
import { REFS } from '../rules/refs.ts';
import { civilDate } from '../time.ts';
import type {
  ActionStep,
  CivilDate,
  Facts,
  Finding,
  HowToReceive,
  LegalRef,
  YearMonth,
} from '../types.ts';
import {
  CATALOG,
  type Condition,
  type DateRule,
  type HowToReceiveTemplate,
  type RuleKey,
} from './catalog.ts';

/** IBGE code of São Paulo/SP (the SAV steps, research 08 §4, REC.4). */
export const SAO_PAULO_IBGE = '3550308';

export interface PlanContext {
  facts: Facts;
  start: YearMonth; // resolved Assumptions.start
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

/** Money fields of a Finding a placeholder may read (`{finding.marginalValue12m}`). */
const FINDING_MONEY = ['marginalValue12m', 'annualRegimeValue'] as const;
type FindingMoney = (typeof FINDING_MONEY)[number];

/** `{R01.P_STAR}` → "2.260,00" from the trace step's result; `{finding.<field>}` → that money field. */
export function resolvePlaceholders(text: string, finding: Finding): string {
  return text.replace(PLACEHOLDER, (_, key: string) => {
    if (key.startsWith('finding.')) {
      const field = key.slice('finding.'.length);
      const value = (FINDING_MONEY as readonly string[]).includes(field)
        ? finding[field as FindingMoney]
        : undefined;
      if (typeof value !== 'number') throw unresolved(finding, key);
      return formatBrl(value);
    }
    const step = finding.trace.find((s) => s.id === key);
    if (step === undefined || step.result.unit !== 'cents' || typeof step.result.value !== 'number')
      throw unresolved(finding, key);
    return formatBrl(step.result.value);
  });
}

/** A catalog placeholder without a value is a catalog bug (T12-11 guards it), never a user error. */
const unresolved = (finding: Finding, key: string) =>
  new EngineError(
    'ENGINE_INTERNAL_ERROR',
    `action plan of ${finding.ruleId}: placeholder {${key}} has no money value in the trace`,
    { ruleId: finding.ruleId, placeholder: key },
  );

/** P* and the current pró-labore of R01, read from its trace (step R01.P_STAR). */
function r01ProLabore(finding: Finding): { pStar: number; current: number } | null {
  const s = finding.trace.find((x) => x.id === 'R01.P_STAR');
  const current = s?.inputs.currentProLabore?.value;
  if (s === undefined || typeof s.result.value !== 'number' || typeof current !== 'number')
    return null;
  return { pStar: s.result.value, current };
}

function holds(c: Condition, finding: Finding, ctx: PlanContext): boolean {
  const facts = ctx.facts;
  switch (c) {
    case 'municipality_sao_paulo':
      return facts.company.value.ibgeMunicipality === SAO_PAULO_IBGE;
    case 'municipality_other':
      return facts.company.value.ibgeMunicipality !== SAO_PAULO_IBGE;
    case 'iss_positive':
      return (finding.byDestination?.municipal[1] ?? 0) > 0;
    case 'icms_positive':
      return (finding.byDestination?.state[1] ?? 0) > 0;
    case 'irpfm_below':
      // P&R Altas Rendas, perg. 4: refundable when the year's income is "inferior a R$ 600.000,00" (strictly below).
      return (
        facts.pfDetails.value.projectedAnnualTotalIncome <
        param('irpfm.threshold', facts.referenceMonth).value
      );
    case 'subject_to_fator_r':
      return facts.companyDetails.value.subjectToFatorR;
    case 'fator_r_raise': {
      const p = r01ProLabore(finding);
      return p !== null && facts.companyDetails.value.subjectToFatorR && p.pStar > p.current;
    }
    case 'pro_labore_lowered': {
      const p = r01ProLabore(finding);
      return p !== null && p.pStar < p.current;
    }
  }
}

const applies = (conditions: Condition[] | undefined, finding: Finding, ctx: PlanContext) =>
  (conditions ?? []).every((c) => holds(c, finding, ctx));

function resolveDate(
  rule: DateRule,
  finding: Finding,
  ctx: PlanContext,
): YearMonth | CivilDate | undefined {
  switch (rule) {
    case 'start':
      return ctx.start;
    case 'regime_from':
      return finding.regimeFrom;
    case 'das_due':
      return dasDueDate(ctx.start);
    case 'inss_due':
      return inssDueDate(ctx.start);
    case 'esocial_due':
      return esocialDueDate(ctx.start);
    case 'darf_irrf_due':
      return secondDecendioLastBusinessDay(ctx.start);
    case 'year_end':
      return civilDate(`${ctx.facts.analysisDate.slice(0, 4)}-12-31`);
    case 'earliest_claim_until':
      return [...(finding.recoveryItems ?? [])].map((i) => i.claimUntil).sort()[0];
  }
}

const isCivilDate = (d: string): d is CivilDate => d.length === 10;

/**
 * A savings finding the chain did not recommend (below its threshold) gets no plan: there is nothing to apply, and
 * listing steps would inflate it. Every other finding (recommended savings, recovery, alerts, risks) gets one.
 */
const needsPlan = (f: Finding) => f.type !== 'savings' || f.countsInTotal;

/** ARCHITECTURE §4.2 / ENGINE-SPEC C.12: the action plan and how the money arrives, for one finding. */
export function buildActionPlan(
  finding: Finding,
  ctx: PlanContext,
): { actionPlan: ActionStep[]; howToReceive: HowToReceive[] } {
  const catalog = CATALOG[finding.ruleId as RuleKey];
  if (catalog === undefined || !needsPlan(finding)) return { actionPlan: [], howToReceive: [] };

  const actionPlan: ActionStep[] = [];
  for (const t of catalog.steps) {
    if (!applies(t.appliesIf, finding, ctx)) continue;
    const step: ActionStep = {
      id: t.id,
      order: actionPlan.length + 1,
      who: t.who,
      what: resolvePlaceholders(t.what, finding),
      refIds: [...t.refIds],
    };
    if (t.where !== undefined) step.where = { ...t.where };
    if (t.from !== undefined) {
      const from = resolveDate(t.from, finding, ctx);
      if (from !== undefined) step.from = from;
    }
    if (t.until !== undefined) {
      const until = resolveDate(t.until, finding, ctx);
      if (until !== undefined && isCivilDate(until)) step.until = until;
    }
    if (t.documents !== undefined) step.documents = [...t.documents];
    if (t.noSource === true) step.noSource = true;
    actionPlan.push(step);
  }

  const howToReceive = catalog.receive
    .filter((t: HowToReceiveTemplate) => applies(t.appliesIf, finding, ctx))
    .map((t) => {
      const out: HowToReceive = {
        method: t.method,
        summary: resolvePlaceholders(t.summary, finding),
        refIds: [...t.refIds],
      };
      if (t.firstEffect !== undefined) {
        const first = resolveDate(t.firstEffect, finding, ctx);
        if (first !== undefined) out.firstEffect = first;
      }
      return out;
    });
  return { actionPlan, howToReceive };
}

/** Fills `actionPlan` and `howToReceive` of every finding in place. */
export function applyActionPlans(findings: Finding[], ctx: PlanContext): void {
  for (const f of findings) {
    const { actionPlan, howToReceive } = buildActionPlan(f, ctx);
    f.actionPlan = actionPlan;
    f.howToReceive = howToReceive;
  }
}

/** The LegalRef behind an action-plan or how-to-receive ref id (a provision or a procedure excerpt). */
export function actionRefOf(id: string): LegalRef | undefined {
  return (REFS as Record<string, LegalRef>)[id] ?? (PROCEDURE_REFS as Record<string, LegalRef>)[id];
}

// explain@1: the model writes the explanation of one finding from its trace (ENGINE-SPEC C.10). It never computes:
// every amount it may use is handed to it already formatted, and it may cite only the finding's own refs. The payload
// is engine output and law text only (no user free text); the port still refuses it if detectPii finds anything.
import { type Finding, formatBrl } from '@refund/engine';
import type { ExplanationInput } from '@refund/pipeline';
import { formatPercent } from '../guards/ptbr.ts';
import { civilDateBr, monthName } from '../templates.ts';

export const EXPLAIN_PROMPT_VERSION = 'explain@2';

export const EXPLAIN_INSTRUCTIONS = `You write the explanation shown on one finding card of Refund, a Brazilian app that finds lawful tax savings for small companies and their owners. A deterministic engine has already done every calculation; you only explain its result.

Write in Brazilian Portuguese, plain language, as a calm auditor who shows the math.

Hard rules (a text that breaks them is discarded and replaced by a template):
1. Never calculate. Use only the amounts and percentages that appear in <data>, written exactly as they are there (for example "R$ 28.316,52"). Do not add, subtract, round to new values, or bring numbers from outside <data>. You may write years, months and counts ("12 meses").
2. Cite only the legal references listed in <data>.refs, using their labels, and return in citedRefIds the id of every reference you cite. Never cite any other law, article or paragraph.
3. Lead with the number, then why, then what the person does. Two to four short sentences, at most 600 characters.
4. Say "pagar a menos" or "economia"; never promise ("garantido", "você vai economizar", "sem risco"). No exclamation marks. If the finding is an estimate or depends on a regulation, say so.
5. Audience "owner": speak to the business owner as "você", no legalese, at most one legal reference. Audience "accountant": technical and concise, cite the references that support the calculation.
6. A finding of type "alert" or "risk" does not count in the savings total: say so. A "recovery" is money paid in the past, outside the 12-month total: write "pago a mais, para recuperar"; for savings never write "paga a mais".
7. When <data> has a deadline, say it. When the range comes from months outside the bank statement (see the trace and the assumptions), say that the top of the range assumes the same pattern in those months.
8. Explain a technical term the first time, in a few words: Fator R (a folha de pagamento dividida pelo faturamento), Anexo (a tabela de alíquotas do Simples), PGDAS-D (a declaração mensal do Simples).
9. Never write "empresas como a sua costumam", never alarm ("você está perdendo", "o governo está te roubando"), never blame the person or their accountant, no English words.

Return JSON with "text" and "citedRefIds".`;

const money = (c: number): string => `R$ ${formatBrl(Math.abs(c))}`;

function stepValue(v: { value: number | string; unit: string }): string {
  if (v.unit === 'cents' && typeof v.value === 'number') return money(v.value);
  if (v.unit === 'rate') return formatPercent(v.value) ?? String(v.value);
  return String(v.value);
}

/** The finding as the model sees it: already formatted values, no raw cents to do arithmetic on. */
export function explainData(input: ExplanationInput) {
  const f: Finding = input.finding;
  return {
    audience: input.audience,
    ruleId: f.ruleId,
    type: f.type,
    title: f.title,
    confidence: f.confidence,
    countsInTotal: f.countsInTotal,
    // An alert or a recovery has no 12-month savings; giving the model that number invites it to call it one.
    ...(f.countsInTotal ? { value12Months: money(f.marginalValue12m) } : {}),
    ...(f.annualRegimeValue === undefined ? {} : { valuePerYear: money(f.annualRegimeValue) }),
    ...(f.regimeFrom === undefined ? {} : { from: monthName(f.regimeFrom) }),
    ...(f.range === undefined ? {} : { range: f.range.map(money) }),
    ...(f.deadline === undefined ? {} : { deadline: civilDateBr(f.deadline) }),
    trace: f.trace.map((s) => ({
      label: s.label,
      formula: s.formula,
      inputs: Object.fromEntries(Object.entries(s.inputs).map(([k, v]) => [k, stepValue(v)])),
      result: stepValue(s.result),
      ...(s.ref === undefined ? {} : { refId: s.ref.id }),
    })),
    refs: f.refs.map((r) => ({ id: r.id, label: r.label })),
    articles: input.articles.map((a) => ({ id: a.id, label: a.label, text: a.text })),
    doNot: f.doNot,
    tradeoffs: f.tradeoffs,
    assumptions: f.assumptionsUsed,
  };
}

export function explainPrompt(input: ExplanationInput): string {
  return `<data>\n${JSON.stringify(explainData(input), null, 1)}\n</data>`;
}

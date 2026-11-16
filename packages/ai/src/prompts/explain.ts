// explain@4 (ADR-016): our code writes the lead sentence (the headline value and its meaning); the model writes what
// follows it as slotted text. It writes no digit, no number
// word, no currency or percent sign, no legal word and no citation: every number, date, the anexo and every legal
// reference enter through the placeholders listed in <slots>, filled by our code after the slot guard accepts the text.
// The payload is engine output and law text only (no user free text); the port still refuses it if detectPii finds
// anything.
import { type Finding, formatBrl } from '@refund/engine';
import type { ExplanationInput } from '@refund/pipeline';
import { LEAD_ONLY } from '../guards/index.ts';
import { formatPercent } from '../guards/ptbr.ts';
import { buildSlots, renderSlots, slotInfo } from '../slots.ts';
import { leadSource } from '../templates.ts';

export const EXPLAIN_PROMPT_VERSION = 'explain@4';

export const EXPLAIN_INSTRUCTIONS = `You write the explanation shown on one finding card of Refund, a Brazilian app that finds lawful tax savings for small companies and their owners. A deterministic engine has already done every calculation; you only explain its result.

Write in Brazilian Portuguese, plain language, as a calm auditor who shows the math.

Our code already wrote the lead sentence, given in <lead>: it states the headline value. Write only what comes after it: the why and what the person does, one to three sentences. Do not repeat the headline value.

How to write numbers and citations (a text that breaks this is discarded and replaced by a template):
1. Every amount, date, month, year, count, percentage, the anexo and every legal reference must be written ONLY as a placeholder from <slots>, exactly as {{name}} (for example "Você pode pagar {{marginalValue12m}} a menos nos próximos {{horizon}}"). Our code fills them in. Use only names listed in <slots>.
2. Outside placeholders, write no digit, no number in words (dois, doze, mil, metade, "um real"…), no currency or percent sign, no "por cento", no roman numeral, and no legal word: lei, artigo, art., §, parágrafo, inciso, alínea, anexo, LC, complementar, decreto, medida provisória, emenda, Constituição, código, súmula, jurisprudência, portaria, resolução, instrução normativa. To cite, use {{ref:N}}; to name the table of the Simples, use {{regimeAnexo}} or say "a tabela do Simples". The phrase "dentro da lei" is allowed. Use only plain Portuguese letters.
3. At most 450 characters. Never write "garantido", "garantia" or "você vai economizar".
4. Say "pagar a menos" or "economia"; never promise ("garantido", "você vai economizar", "sem risco"). No exclamation marks. If the finding is an estimate or depends on a regulation, say so.
5. Audience "owner": speak to the business owner as "você", no legalese, at most one {{ref:N}}. Audience "accountant": technical and concise, cite the references that support the calculation.
6. A finding of type "alert" or "risk" does not count in the savings total: say so. A "recovery" is money paid in the past, outside the 12-month total: write "pago a mais, para recuperar"; for savings never write "paga a mais".
7. When <slots> has a deadline, say it. When the range comes from months outside the bank statement (projectedMonths), say that the top of the range assumes the same pattern in those months.
8. Explain a technical term the first time, in a few words: Fator R (a folha de pagamento dividida pelo faturamento), PGDAS-D (a declaração mensal do Simples).
9. Never write "empresas como a sua costumam", never alarm ("você está perdendo", "o governo está te roubando"), never blame the person or their accountant, no English words.

Return JSON with "text".`;

const money = (c: number): string => `R$ ${formatBrl(Math.abs(c))}`;

function stepValue(v: { value: number | string; unit: string }): string {
  if (v.unit === 'cents' && typeof v.value === 'number') return money(v.value);
  if (v.unit === 'rate') return formatPercent(v.value) ?? String(v.value);
  return String(v.value);
}

/** The finding as the model sees it: what each placeholder holds, and the trace to explain the why. */
export function explainData(input: ExplanationInput) {
  const f: Finding = input.finding;
  // The headline slots live only in the lead our code writes (code review 16/11).
  const slots = Object.fromEntries(
    Object.entries(slotInfo(f)).filter(([k]) => !LEAD_ONLY.includes(k)),
  );
  const lead = renderSlots(leadSource(f, input.audience), buildSlots(f)) ?? '';
  return {
    lead,
    audience: input.audience,
    ruleId: f.ruleId,
    type: f.type,
    title: f.title,
    confidence: f.confidence,
    countsInTotal: f.countsInTotal,
    slots,
    trace: f.trace.map((s) => ({
      label: s.label,
      formula: s.formula,
      inputs: Object.fromEntries(Object.entries(s.inputs).map(([k, v]) => [k, stepValue(v)])),
      result: stepValue(s.result),
    })),
    articles: input.articles.map((a) => ({ label: a.label, text: a.text })),
    doNot: f.doNot,
    tradeoffs: f.tradeoffs,
    assumptions: f.assumptionsUsed,
  };
}

export function explainPrompt(input: ExplanationInput): string {
  const { slots, lead, ...data } = explainData(input);
  return `<lead>${lead}</lead>\n<data>\n${JSON.stringify(data, null, 1)}\n</data>\n<slots>\n${JSON.stringify(slots, null, 1)}\n</slots>`;
}

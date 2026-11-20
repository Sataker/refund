// Slots (ADR-016): every number, date, percentage, anexo and legal citation of an explanation enters only through a
// placeholder `{{name}}` whose value our code formats from the finding and its trace (ENGINE-SPEC C.10). The model and
// the template write the same slotted text; one renderer fills it in after the slot guard accepted it.
import {
  type Cents,
  type CivilDate,
  type Finding,
  formatBrl,
  type Step,
  type YearMonth,
} from '@refund/engine';
import { formatPercent } from './guards/ptbr.ts';

export type Slots = Readonly<Record<string, string>>;

/** A slot and what it means, for the prompt. */
export interface SlotInfo {
  value: string;
  meaning: string;
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

export const money = (c: Cents | number): string => `R$ ${formatBrl(Math.abs(c))}`;

/** '2027-04' → 'abril de 2027' (IDENTITY-AND-UI §2.3: "a partir de abril de 2027"). */
export function monthName(m: YearMonth): string {
  const name = MONTHS[Number(m.slice(5, 7)) - 1];
  return name === undefined ? m : `${name} de ${m.slice(0, 4)}`;
}

/** '2026-11-23' → '23/11/2026'. */
export const civilDateBr = (d: CivilDate): string =>
  `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export const stepOf = (f: Finding, id: string): Step | undefined =>
  f.trace.find((s) => s.id === id);

export function centsIn(step: Step | undefined, input: string): number | null {
  const v = step?.inputs[input];
  return v?.unit === 'cents' && typeof v.value === 'number' ? v.value : null;
}

export const resultCents = (step: Step | undefined): number | null =>
  step?.result.unit === 'cents' && typeof step.result.value === 'number' ? step.result.value : null;

function monthsIn(step: Step | undefined, input: string): number | null {
  const v = step?.inputs[input];
  return (v?.unit === 'months' || v?.unit === 'cents') && typeof v.value === 'number'
    ? v.value
    : null;
}

/** The anexo a rule's last monthly step lands in ("PA 11/2027: … (Anexo III)"). */
export function lastAnexo(f: Finding): string | null {
  for (const s of [...f.trace].reverse()) {
    const a = s.inputs.anexo?.value;
    if (typeof a === 'string' && /^(I{1,3}|IV|V)$/.test(a)) return a;
    const m = /\(Anexo (I{1,3}|IV|V)\)/.exec(s.label);
    if (m !== null) return m[1] as string;
  }
  return null;
}

/** The finding's single withholding step (R02-like alerts), when it has exactly one. */
export function withholdingStep(f: Finding): Step | null {
  const steps = f.trace.filter((s) => s.id.startsWith(`${f.ruleId}.FINANCIAL_COST.`));
  return steps.length === 1 ? (steps[0] as Step) : null;
}

/** Every slot the finding can fill, with its PT-BR value and meaning. Absent data = absent slot. */
export function slotInfo(f: Finding): Record<string, SlotInfo> {
  const out: Record<string, SlotInfo> = {};
  const put = (name: string, value: string | null, meaning: string) => {
    if (value !== null) out[name] = { value, meaning };
  };
  put('horizon', '12 meses', 'o horizonte da economia: os próximos 12 meses');
  put('marginalValue12m', money(f.marginalValue12m), 'o valor do achado nos próximos 12 meses');
  if (f.annualRegimeValue !== undefined && f.annualRegimeValue > 0)
    put(
      'annualRegimeValue',
      money(f.annualRegimeValue),
      'o valor por ano depois que o regime se acomoda',
    );
  if (f.regimeFrom !== undefined)
    put('regimeFrom', monthName(f.regimeFrom), 'a partir de quando vale o valor por ano');
  if (f.range !== undefined) {
    put('rangeMin', money(f.range[0]), 'o mínimo da faixa');
    put('rangeMax', money(f.range[1]), 'o máximo da faixa');
  }
  if (f.deadline !== undefined)
    put('deadline', civilDateBr(f.deadline), 'o prazo do mês mais antigo');

  const pStar = stepOf(f, `${f.ruleId}.P_STAR`);
  const target = resultCents(pStar);
  const current = centsIn(pStar, 'currentProLabore');
  put('proLaboreTarget', target === null ? null : money(target), 'o pró-labore mensal recomendado');
  put('proLaboreCurrent', current === null ? null : money(current), 'o pró-labore mensal de hoje');

  const marginal = stepOf(f, `${f.ruleId}.MARGINAL_12M`);
  const before = centsIn(marginal, 'before');
  const after = centsIn(marginal, 'after');
  if (before !== null && after !== null && before > after) {
    put('costBefore', money(before), 'o custo dos próximos 12 meses antes desta mudança');
    put('costAfter', money(after), 'o custo dos próximos 12 meses depois desta mudança');
  }

  const anexo = lastAnexo(f);
  put(
    'regimeAnexo',
    anexo === null ? null : `Anexo ${anexo}`,
    'a tabela do Simples em que a empresa fica',
  );

  const range = stepOf(f, `${f.ruleId}.RANGE`);
  const measured = centsIn(range, 'measured');
  const seen = monthsIn(range, 'measuredPas');
  const projected = monthsIn(range, 'projectedPas');
  if (measured !== null && seen !== null && projected !== null) {
    put('measured', money(measured), 'o que foi pago a mais nos meses do extrato');
    put('measuredMonths', `${seen} meses`, 'os meses vistos no extrato');
    put(
      'projectedMonths',
      `${projected} meses`,
      'os meses anteriores, fora do extrato, projetados',
    );
  }

  const w = withholdingStep(f);
  if (w !== null && w.month !== undefined) {
    const withheld = centsIn(w, 'withheld');
    const total = centsIn(w, 'total');
    const cost = resultCents(w);
    const months = w.inputs.months?.value;
    const selic = w.inputs.selicAnnual?.value;
    put('withheld', withheld === null ? null : money(withheld), 'o IR retido na distribuição');
    put('distributed', total === null ? null : money(total), 'o valor distribuído');
    put('withholdingMonth', monthName(w.month), 'o mês da distribuição');
    const year =
      /(?:DIRPF|declaração de) (\d{4})/.exec(f.title)?.[1] ??
      String(Number(w.month.slice(0, 4)) + 1);
    put('returnYear', year, 'o ano da declaração em que o valor volta');
    put(
      'monthsWaiting',
      typeof months === 'number' ? `${months} meses` : null,
      'quanto tempo o dinheiro fica parado',
    );
    put('financialCost', cost === null ? null : money(cost), 'o custo do dinheiro parado');
    put('selicRate', selic === undefined ? null : formatPercent(selic), 'a Selic anual usada');
  }

  f.refs.forEach((r, i) => {
    put(`ref:${i}`, r.label, 'a referência legal');
  });
  return out;
}

export const buildSlots = (f: Finding): Slots =>
  Object.fromEntries(Object.entries(slotInfo(f)).map(([k, v]) => [k, v.value]));

export const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

/** Fills every `{{name}}`; null when a name has no value (the slot guard rejects that before). */
export function renderSlots(source: string, slots: Slots): string | null {
  let missing = false;
  const text = source.replace(PLACEHOLDER, (_, name: string) => {
    const v = slots[name];
    if (v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : text;
}

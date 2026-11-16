// Deterministic explanation (ARCHITECTURE §4.5): the fallback of every LlmPort mode and the whole `template` mode.
// Built only from the finding and its trace (ENGINE-SPEC C.10), so it passes the numeric and citation guards by
// construction: every amount is a finding field or a trace value, and only the finding's own refs are cited.
import {
  type Cents,
  type CivilDate,
  type Finding,
  formatBrl,
  type YearMonth,
} from '@refund/engine';
import type { ExplanationInput, ExplanationOutput } from '@refund/pipeline';

export const TEMPLATE_VERSION = 'template@1';

export type Audience = ExplanationInput['audience'];

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

const money = (c: Cents | number): string => `R$ ${formatBrl(Math.abs(c))}`;

/** '2027-04' → 'abril de 2027' (IDENTITY-AND-UI §2.3: "a partir de abril de 2027"). */
export function monthName(m: YearMonth): string {
  const name = MONTHS[Number(m.slice(5, 7)) - 1];
  return name === undefined ? m : `${name} de ${m.slice(0, 4)}`;
}

/** '2026-11-23' → '23/11/2026'. */
export const civilDateBr = (d: CivilDate): string =>
  `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Lower-cases the first letter of an engine sentence, unless it starts with an acronym ("IRPFM", "ISS"). */
function continueSentence(s: string): string {
  const [first, second] = Array.from(s);
  if (
    first === undefined ||
    (second !== undefined && second === second.toUpperCase() && /\p{L}/u.test(second))
  )
    return s;
  return first.toLowerCase() + s.slice(first.length);
}

/** A sentence the engine wrote that carries no number and no citation can be repeated without any guard risk. */
const withoutDigits = (s: string): boolean => !/\d/.test(s);

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/** `<rule>.MARGINAL_12M` with `before`/`after` costs in cents (C.5 cost function), when the rule wrote one. */
function costDrop(f: Finding): { before: number; after: number } | null {
  const step = f.trace.find((s) => s.id === `${f.ruleId}.MARGINAL_12M`);
  const before = step?.inputs.before;
  const after = step?.inputs.after;
  if (before?.unit !== 'cents' || after?.unit !== 'cents') return null;
  if (typeof before.value !== 'number' || typeof after.value !== 'number') return null;
  if (!(before.value > after.value)) return null;
  return { before: before.value, after: after.value };
}

/** The step that holds the finding's own value: `<rule>.MARGINAL_12M`, else the last step with a cents result. */
function valueStep(f: Finding): { label: string; value: number } | null {
  const steps = [...f.trace].reverse();
  const step =
    steps.find((s) => s.id === `${f.ruleId}.MARGINAL_12M` && s.result.unit === 'cents') ??
    steps.find((s) => s.result.unit === 'cents');
  if (step === undefined || typeof step.result.value !== 'number' || step.result.value === 0)
    return null;
  return { label: step.label, value: step.result.value };
}

function confidenceSentence(f: Finding): string {
  switch (f.confidence) {
    case 'confirmed':
      return 'O valor usa só dados do banco, da Receita e o que foi confirmado.';
    case 'estimated':
      return 'É uma estimativa: depende de premissas que dá para revisar em “Ver cálculo”.';
    default:
      return 'Depende de norma que ainda não saiu; o valor pode mudar quando ela for publicada.';
  }
}

function savingsLead(f: Finding, audience: Audience): string[] {
  const who = audience === 'owner' ? 'Você pode pagar' : 'A empresa pode pagar';
  const out: string[] = [];
  const lo = f.range?.[0];
  const hi = f.range?.[1];
  if (f.marginalValue12m > 0) {
    if (f.confidence !== 'confirmed' && lo !== undefined && hi !== undefined && lo !== hi) {
      out.push(
        `${who} de ${money(lo)} a ${money(hi)} a menos nos próximos 12 meses, dentro da lei.`,
      );
    } else {
      out.push(`${who} ${money(f.marginalValue12m)} a menos nos próximos 12 meses, dentro da lei.`);
    }
  } else {
    out.push('Este achado não muda o total dos próximos 12 meses.');
  }
  if (f.annualRegimeValue !== undefined && f.annualRegimeValue > 0) {
    const from = f.regimeFrom === undefined ? '' : ` a partir de ${monthName(f.regimeFrom)}`;
    out.push(`Depois, são ${money(f.annualRegimeValue)} a menos por ano${from}.`);
  }
  const drop = costDrop(f);
  if (drop !== null) {
    out.push(
      `Somando os impostos da empresa e os do sócio, o custo dos próximos 12 meses cai de ${money(drop.before)} para ${money(drop.after)}.`,
    );
  }
  return out;
}

function recoveryLead(f: Finding, audience: Audience): string[] {
  const out: string[] = [];
  const [lo, hi] = f.range ?? [f.marginalValue12m, f.marginalValue12m];
  const who = audience === 'owner' ? 'Você pode ter pago' : 'A empresa pode ter pago';
  if (hi > 0) {
    out.push(
      lo === hi
        ? `${who} ${money(hi)} a mais, para recuperar (estimativa).`
        : `${who} de ${money(lo)} a ${money(hi)} a mais, para recuperar (estimativa).`,
    );
  }
  out.push('Esse dinheiro é do passado e não entra no total de economia dos próximos 12 meses.');
  if (f.deadline !== undefined) {
    out.push(`Há prazo: o mês mais antigo só pode ser pedido até ${civilDateBr(f.deadline)}.`);
  }
  return out;
}

function alertLead(f: Finding): string[] {
  const out = ['Isto é um alerta e não entra no total de economia.'];
  const v = valueStep(f);
  if (v !== null) out.push(`${v.label.replace(/\s*\(fora do total\)/, '')}: ${money(v.value)}.`);
  return out;
}

/**
 * The deterministic explanation of a finding (pt-BR, IDENTITY-AND-UI §2.3: number first, "pagar a menos", no
 * promise). `owner` speaks to the business owner without legalese; `accountant` adds the legal basis.
 */
export function templateExplanation(finding: Finding, audience: Audience = 'owner'): string {
  const parts: string[] = [];
  switch (finding.type) {
    case 'savings':
      parts.push(...savingsLead(finding, audience));
      break;
    case 'recovery':
      parts.push(...recoveryLead(finding, audience));
      break;
    case 'alert':
      parts.push(...alertLead(finding));
      break;
    default:
      parts.push('Isso parece economia, mas é risco. Não recomendamos.');
  }
  if (finding.type !== 'risk') parts.push(confidenceSentence(finding));

  // Only the engine's main tradeoff: a later one may speak about the opposite move (R01's "pró-labore menor").
  const tradeoff = finding.tradeoffs[0];
  if (tradeoff !== undefined && withoutDigits(tradeoff) && finding.type !== 'risk')
    parts.push(sentence(`Contrapartida: ${continueSentence(tradeoff)}`));
  if (finding.type === 'risk' || finding.type === 'alert') {
    const doNot = finding.doNot.find(withoutDigits);
    if (doNot !== undefined) parts.push(sentence(doNot));
  }

  if (audience === 'accountant') {
    if (finding.refs.length > 0)
      parts.push(`Base legal: ${finding.refs.map((r) => r.label).join('; ')}.`);
    parts.push('O cálculo completo, passo a passo, está no relatório.');
  } else {
    parts.push('Cada passo da conta e o artigo da lei estão em “Ver cálculo”.');
    parts.push('Valide com seu contador antes de agir.');
  }
  return parts.join(' ');
}

/** The template as an `ExplanationOutput`; `guards` records why it is being shown (a failed guard, or none). */
export function templateOutput(
  finding: Finding,
  audience: Audience = 'owner',
  guards: ExplanationOutput['guards'] = { numeric: 'not_applied', citation: 'not_applied' },
): ExplanationOutput {
  return {
    text: templateExplanation(finding, audience),
    origin: 'template',
    guards,
    promptVersion: TEMPLATE_VERSION,
  };
}

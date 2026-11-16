// Deterministic explanation (ARCHITECTURE §4.5): the fallback of every LlmPort mode and the whole `template` mode.
// Built only from the finding and its trace (ENGINE-SPEC C.10), so it passes the numeric and citation guards by
// construction: every amount is a finding field or a trace value, and only the finding's own refs are cited.
// Copy: IDENTITY-AND-UI §2.3 (number first, then why, then what to do; "pagar a menos"; no promise).
import {
  type Cents,
  type CivilDate,
  type Finding,
  formatBrl,
  type Step,
  type YearMonth,
} from '@refund/engine';
import type { ExplanationInput, ExplanationOutput } from '@refund/pipeline';
import { citationGuard } from './guards/citation.ts';
import { findingNumericGuard } from './guards/numeric.ts';
import { formatPercent } from './guards/ptbr.ts';

export const TEMPLATE_VERSION = 'template@2';

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

const sentence = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);
/** Engine strings use straight quotes; the UI uses typographic ones. */
const curlyQuotes = (s: string): string => s.replace(/"([^"]*)"/g, '“$1”');

const stepOf = (f: Finding, id: string): Step | undefined => f.trace.find((s) => s.id === id);

function centsIn(step: Step | undefined, input: string): number | null {
  const v = step?.inputs[input];
  return v?.unit === 'cents' && typeof v.value === 'number' ? v.value : null;
}

const resultCents = (step: Step | undefined): number | null =>
  step?.result.unit === 'cents' && typeof step.result.value === 'number' ? step.result.value : null;

/** A sentence the engine wrote, kept only if both guards accept it for this finding. */
const guarded = (f: Finding, s: string): boolean =>
  findingNumericGuard(s, f).ok && citationGuard(s, f.refs).ok;

interface Voice {
  /** "Você pode pagar" / "A empresa pode pagar". */
  can: string;
  confirmedBy: string;
}

const voiceOf = (audience: Audience): Voice =>
  audience === 'owner'
    ? { can: 'Você pode pagar', confirmedBy: 'o que você confirmou' }
    : { can: 'A empresa pode pagar', confirmedBy: 'o que o cliente confirmou' };

function confidenceSentence(f: Finding, v: Voice): string {
  switch (f.confidence) {
    case 'confirmed':
      return `Valor confirmado: usa só dados do banco, da Receita e ${v.confirmedBy}.`;
    case 'estimated':
      return 'Estimativa: depende de premissas que podem ser revistas.';
    default:
      return 'Depende de norma que ainda não saiu; o valor pode mudar quando ela for publicada.';
  }
}

/** The anexo a rule's last monthly step lands in ("PA 11/2027: … (Anexo III)"). */
function lastAnexo(f: Finding): string | null {
  for (const s of [...f.trace].reverse()) {
    const m = /\(Anexo (I{1,3}|IV|V)\)/.exec(s.label);
    if (m !== null) return m[1] as string;
  }
  return null;
}

/** What the person does, per rule, from the trace (the headline already says it; here it closes the first line). */
function action(f: Finding, audience: Audience): string | null {
  if (f.ruleId === 'R01') {
    const p = resultCents(stepOf(f, 'R01.P_STAR'));
    if (p === null) return null;
    const whose = audience === 'owner' ? 'seu pró-labore' : 'o pró-labore do sócio';
    return `subindo ${whose} para ${money(p)} por mês`;
  }
  if (f.ruleId === 'R05') return 'declarando a receita do exterior como exportação no PGDAS-D';
  return null;
}

function savings(f: Finding, audience: Audience, v: Voice): string[] {
  const out: string[] = [];
  const lo = f.range?.[0];
  const hi = f.range?.[1];
  const how = action(f, audience);
  const tail = how === null ? '' : `, ${how}`;
  if (f.marginalValue12m > 0) {
    out.push(
      f.confidence !== 'confirmed' && lo !== undefined && hi !== undefined && lo !== hi
        ? `${v.can} de ${money(lo)} a ${money(hi)} a menos nos próximos 12 meses, dentro da lei${tail}.`
        : `${v.can} ${money(f.marginalValue12m)} a menos nos próximos 12 meses, dentro da lei${tail}.`,
    );
  } else {
    out.push('Este achado não muda o total dos próximos 12 meses.');
  }

  const regime = f.annualRegimeValue !== undefined && f.annualRegimeValue > 0;
  const anexo = lastAnexo(f);
  if (f.ruleId === 'R01' && regime && f.regimeFrom !== undefined) {
    // R01 moves the company to the cheaper table (C.7): why, then the steady-state value.
    out.push(
      `Com a folha maior, a empresa passa para uma tabela mais barata do Simples (Anexo III) a partir de ${monthName(f.regimeFrom)}; depois, são ${money(f.annualRegimeValue as number)} a menos por ano.`,
    );
  } else if (regime && f.order > 1 && anexo !== null) {
    out.push(
      `Com a empresa já no Anexo ${anexo}, esta mudança vale ${money(f.annualRegimeValue as number)} por ano.`,
    );
  } else if (regime) {
    const from = f.regimeFrom === undefined ? '' : ` a partir de ${monthName(f.regimeFrom)}`;
    out.push(`Depois, são ${money(f.annualRegimeValue as number)} a menos por ano${from}.`);
  }

  const marginal = stepOf(f, `${f.ruleId}.MARGINAL_12M`);
  const before = centsIn(marginal, 'before');
  const after = centsIn(marginal, 'after');
  if (before !== null && after !== null && before > after) {
    // In the combined scenario (C.6) a later rule starts from the cost the earlier ones left.
    out.push(
      f.order > 1
        ? `Somada aos ajustes acima, esta mudança leva o custo dos próximos 12 meses de ${money(before)} para ${money(after)}.`
        : `Somando os impostos da empresa e os do sócio, o custo dos próximos 12 meses cai de ${money(before)} para ${money(after)}.`,
    );
  }
  return out;
}

function recovery(f: Finding): string[] {
  const out: string[] = [];
  const range = stepOf(f, `${f.ruleId}.RANGE`);
  const measured = centsIn(range, 'measured');
  const months = (k: string) => {
    const x = range?.inputs[k];
    return x?.unit === 'months' && typeof x.value === 'number' ? x.value : null;
  };
  const seen = months('measuredPas');
  const projected = months('projectedPas');
  const max = resultCents(range);
  const selic =
    range !== undefined && /Selic/.test(range.label) ? ', sem a correção pela Selic' : '';
  if (measured !== null && max !== null && seen !== null && projected !== null && max > measured) {
    out.push(
      `Nos ${seen} meses do extrato, a empresa pagou ${money(measured)} a mais.`,
      `Se o mesmo padrão valeu nos ${projected} meses anteriores, chega a ${money(max)} (estimativa${selic}).`,
    );
  } else {
    const [lo, hi] = f.range ?? [f.marginalValue12m, f.marginalValue12m];
    if (hi > 0)
      out.push(
        lo === hi
          ? `A empresa pode ter pago ${money(hi)} a mais, para recuperar (estimativa).`
          : `A empresa pode ter pago de ${money(lo)} a ${money(hi)} a mais, para recuperar (estimativa).`,
      );
  }
  const d = f.byDestination;
  if (d !== undefined) {
    const from = [
      d.federal[1] > 0 ? 'a parte federal volta da Receita' : null,
      d.municipal[1] > 0 ? 'o ISS, da Prefeitura' : null,
      d.state[1] > 0 ? 'o ICMS, do Estado' : null,
    ].filter((x): x is string => x !== null);
    const [first, ...rest] = from;
    if (first !== undefined)
      out.push(
        sentence(
          `${first[0]?.toUpperCase()}${first.slice(1)}${rest.map((r) => `; ${r}`).join('')}`,
        ),
      );
  }
  out.push('Esse dinheiro é do passado e não entra no total de economia dos próximos 12 meses.');
  if (f.deadline !== undefined)
    out.push(
      `Há prazo: o mês mais antigo só pode ser pedido até ${civilDateBr(f.deadline)}; depois dessa data, esse mês não pode mais ser pedido.`,
    );
  return out;
}

/** R02-like alerts: one withholding that only comes back in next year's return (FINANCIAL_COST step). */
function withholding(f: Finding): string | null {
  const steps = f.trace.filter((s) => s.id.startsWith(`${f.ruleId}.FINANCIAL_COST.`));
  const [s] = steps;
  if (steps.length !== 1 || s === undefined || s.month === undefined) return null;
  const withheld = centsIn(s, 'withheld');
  const total = centsIn(s, 'total');
  const months = s.inputs.months?.value;
  const selic = s.inputs.selicAnnual?.value;
  const cost = resultCents(s);
  if (withheld === null || total === null || cost === null || typeof months !== 'number')
    return null;
  const rate = selic === undefined ? null : formatPercent(selic);
  const year = /DIRPF (\d{4})/.exec(f.title)?.[1] ?? String(Number(s.month.slice(0, 4)) + 1);
  return (
    `Os ${money(withheld)} de IR retidos na distribuição de ${money(total)} de ${monthName(s.month)} só voltam na declaração de ${year}: ` +
    `são ${months} meses de dinheiro parado, que custam ${money(cost)}${rate === null ? '' : ` com a Selic de ${rate} ao ano`}.`
  );
}

function alert(f: Finding): string[] {
  const lead = withholding(f);
  if (lead !== null) return [lead, 'É um alerta e não entra no total de economia.'];
  const out = ['Isto é um alerta e não entra no total de economia.'];
  const steps = [...f.trace].reverse();
  const step =
    steps.find((s) => s.id === `${f.ruleId}.MARGINAL_12M` && s.result.unit === 'cents') ??
    steps.find((s) => s.result.unit === 'cents');
  const value = resultCents(step);
  if (step !== undefined && value !== null && value !== 0)
    out.push(`${step.label.replace(/\s*\(fora do total\)/, '')}: ${money(value)}.`);
  return out;
}

/**
 * The deterministic explanation of a finding (pt-BR). `owner` speaks to the business owner without legalese;
 * `accountant` names the company and adds the legal basis.
 */
export function templateExplanation(finding: Finding, audience: Audience = 'owner'): string {
  const v = voiceOf(audience);
  const parts: string[] = [];
  const doNot = finding.doNot.find((s) => !/\d/.test(s));

  if (finding.type === 'risk') {
    parts.push('Isso parece economia, mas é risco e não entra no total. Não recomendamos.');
    if (doNot !== undefined) parts.push(sentence(doNot));
    parts.push('Veja por quê em “Ver cálculo”.');
    return curlyQuotes(parts.join(' '));
  }

  if (finding.type === 'savings') parts.push(...savings(finding, audience, v));
  else if (finding.type === 'recovery') parts.push(...recovery(finding));
  else parts.push(...alert(finding));

  // A recovery already says "estimativa" beside its range.
  if (!(finding.type === 'recovery' && finding.confidence === 'estimated'))
    parts.push(confidenceSentence(finding, v));

  // The engine's main tradeoff, if it holds no number or citation the guards would refuse.
  const tradeoff = finding.tradeoffs[0];
  if (tradeoff !== undefined && guarded(finding, tradeoff))
    parts.push(sentence(`Contrapartida: ${continueSentence(tradeoff)}`));
  if (doNot !== undefined) parts.push(sentence(doNot));

  if (audience === 'accountant') {
    if (finding.refs.length > 0)
      parts.push(`Base legal: ${finding.refs.map((r) => r.label).join('; ')}.`);
    parts.push('O cálculo completo, passo a passo, está no relatório.');
  } else {
    parts.push('A conta e a lei estão em “Ver cálculo”.');
  }
  return curlyQuotes(parts.join(' '));
}

/**
 * The port's last resort: the template, or, if even the finding is malformed, its title (what the pipeline shows
 * before any explanation). Never throws.
 */
export function safeTemplateOutput(
  input: ExplanationInput,
  guards?: ExplanationOutput['guards'],
): ExplanationOutput {
  try {
    return templateOutput(input.finding, input.audience, guards);
  } catch {
    const title = (input as { finding?: { title?: unknown } } | undefined)?.finding?.title;
    return {
      text: typeof title === 'string' && title !== '' ? title : 'Veja o cálculo em “Ver cálculo”.',
      origin: 'template',
      guards: guards ?? { numeric: 'not_applied', citation: 'not_applied' },
      promptVersion: TEMPLATE_VERSION,
    };
  }
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

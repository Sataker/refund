// Deterministic explanation (ARCHITECTURE §4.5): the fallback of every LlmPort mode and the whole `template` mode.
// Written as slotted text (ADR-016), exactly like a model answer, and filled by the same renderer: every number and
// citation comes from the finding and its trace (ENGINE-SPEC C.10). Engine sentences (tradeoffs, "não faça") are kept
// only if the slot guard accepts them. Copy: IDENTITY-AND-UI §2.3 (number first, then why, then what to do).
import type { Finding } from '@refund/engine';
import type { ExplanationInput, ExplanationOutput } from '@refund/pipeline';
import { slotGuard } from './guards/slots.ts';
import {
  buildSlots,
  civilDateBr,
  monthName,
  renderSlots,
  resultCents,
  type Slots,
  stepOf,
} from './slots.ts';

export { civilDateBr, monthName };

export const TEMPLATE_VERSION = 'template@3';

export type Audience = ExplanationInput['audience'];

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

interface Ctx {
  f: Finding;
  audience: Audience;
  has: (slot: string) => boolean;
  /** An engine sentence is usable when it passes the slot guard (no number, no citation). */
  clean: (s: string) => boolean;
}

const confirmedBy = (a: Audience) =>
  a === 'owner' ? 'o que você confirmou' : 'o que o cliente confirmou';

function confidence({ f, audience }: Ctx): string {
  switch (f.confidence) {
    case 'confirmed':
      return `Valor confirmado: usa só dados do banco, da Receita e ${confirmedBy(audience)}.`;
    case 'estimated':
      return 'Estimativa: depende de premissas que podem ser revistas.';
    default:
      return 'Depende de norma que ainda não saiu; o valor pode mudar quando ela for publicada.';
  }
}

/** What the person does, per rule (closes the first line). */
function action({ f, audience, has }: Ctx): string | null {
  if (f.ruleId === 'R01' && has('proLaboreTarget')) {
    const whose = audience === 'owner' ? 'seu pró-labore' : 'o pró-labore do sócio';
    return `subindo ${whose} para {{proLaboreTarget}} por mês`;
  }
  if (f.ruleId === 'R05') return 'declarando a receita do exterior como exportação no PGDAS-D';
  return null;
}

function savings(ctx: Ctx): Parts {
  const { f, audience, has } = ctx;
  const out: string[] = [];
  const can = audience === 'owner' ? 'Você pode pagar' : 'A empresa pode pagar';
  const how = action(ctx);
  const tail = how === null ? '' : `, ${how}`;
  if (f.marginalValue12m > 0) {
    const ranged =
      f.confidence !== 'confirmed' && f.range !== undefined && f.range[0] !== f.range[1];
    out.push(
      ranged
        ? `${can} de {{rangeMin}} a {{rangeMax}} a menos nos próximos {{horizon}}, dentro da lei${tail}.`
        : `${can} {{marginalValue12m}} a menos nos próximos {{horizon}}, dentro da lei${tail}.`,
    );
  } else {
    out.push('Este achado não muda o total dos próximos {{horizon}}.');
  }
  const lead = out.splice(0, out.length);

  if (has('annualRegimeValue')) {
    if (f.ruleId === 'R01' && has('regimeFrom') && has('regimeAnexo'))
      // R01 moves the company to the cheaper table (ENGINE-SPEC C.7): why, then the steady-state value.
      out.push(
        'Com a folha maior, a empresa passa para uma tabela mais barata do Simples ({{regimeAnexo}}) a partir de {{regimeFrom}}; depois, são {{annualRegimeValue}} a menos por ano.',
      );
    else if (f.order > 1 && has('regimeAnexo'))
      out.push(
        'Com a empresa já no {{regimeAnexo}}, esta mudança vale {{annualRegimeValue}} por ano.',
      );
    else
      out.push(
        `Depois, são {{annualRegimeValue}} a menos por ano${has('regimeFrom') ? ' a partir de {{regimeFrom}}' : ''}.`,
      );
  }

  if (has('costBefore'))
    // In the combined scenario (ENGINE-SPEC C.6) a later rule starts from the cost the earlier ones left.
    out.push(
      f.order > 1
        ? 'Junto com as outras mudanças recomendadas, esta leva o custo dos próximos {{horizon}} de {{costBefore}} para {{costAfter}}.'
        : 'Somando os impostos da empresa e os do sócio, o custo dos próximos {{horizon}} cai de {{costBefore}} para {{costAfter}}.',
    );
  return { lead, rest: out };
}

function recovery({ f, has }: Ctx): Parts {
  const out: string[] = [];
  const range = stepOf(f, `${f.ruleId}.RANGE`);
  const max = resultCents(range);
  const selic =
    range !== undefined && /Selic/.test(range.label) ? ', sem a correção pela Selic' : '';
  if (has('measured') && max !== null && f.range?.[1] === max) {
    out.push(
      'Nos {{measuredMonths}} do extrato, a empresa pagou {{measured}} a mais.',
      `Se o mesmo padrão valeu nos {{projectedMonths}} anteriores, chega a {{rangeMax}} (estimativa${selic}).`,
    );
  } else if (f.range !== undefined) {
    out.push(
      f.range[0] === f.range[1]
        ? 'A empresa pode ter pago {{rangeMax}} a mais, para recuperar (estimativa).'
        : 'A empresa pode ter pago de {{rangeMin}} a {{rangeMax}} a mais, para recuperar (estimativa).',
    );
  }
  const lead = out.splice(0, out.length);
  const d = f.byDestination;
  if (d !== undefined) {
    const from = [
      d.federal[1] > 0 ? 'a parte federal volta da Receita' : null,
      d.municipal[1] > 0 ? 'o ISS, da Prefeitura' : null,
      d.state[1] > 0 ? 'o ICMS, do Estado' : null,
    ].filter((x): x is string => x !== null);
    if (from.length > 0) {
      const text = from.join('; ');
      out.push(sentence(`${text.charAt(0).toUpperCase()}${text.slice(1)}`));
    }
  }
  out.push('Esse dinheiro é do passado e não entra no total de economia dos próximos {{horizon}}.');
  if (has('deadline'))
    out.push(
      'Há prazo: o mês mais antigo só pode ser pedido até {{deadline}}; depois dessa data, esse mês não pode mais ser pedido.',
    );
  return { lead, rest: out };
}

function alert({ f, has }: Ctx): Parts {
  if (has('withheld') && has('distributed') && has('financialCost') && has('monthsWaiting'))
    return {
      rest: [],
      lead: [
        'Os {{withheld}} de IR retidos na distribuição de {{distributed}} de {{withholdingMonth}} só voltam na declaração de {{returnYear}}: ' +
          `são {{monthsWaiting}} de dinheiro parado, que custam {{financialCost}}${has('selicRate') ? ' com a Selic de {{selicRate}} ao ano' : ''}.`,
        'É um alerta e não entra no total de economia.',
      ],
    };
  const out = ['Isto é um alerta e não entra no total de economia.'];
  if (f.marginalValue12m !== 0) out.push('O efeito calculado é de {{marginalValue12m}}.');
  return { lead: out, rest: [] };
}

interface Parts {
  /** The headline value and its meaning: written by our code for the model path too (ADR-016). */
  lead: string[];
  rest: string[];
}

const RISK_LEAD = 'Isso parece economia, mas é risco e não entra no total. Não recomendamos.';

function ctxOf(finding: Finding, audience: Audience): { ctx: Ctx; slots: Slots } {
  const slots = buildSlots(finding);
  const allowed = new Set(Object.keys(slots));
  return {
    slots,
    ctx: {
      f: finding,
      audience,
      has: (s) => allowed.has(s),
      clean: (s) => slotGuard(s, allowed).ok,
    },
  };
}

function parts(ctx: Ctx): Parts {
  if (ctx.f.type === 'savings') return savings(ctx);
  if (ctx.f.type === 'recovery') return recovery(ctx);
  if (ctx.f.type === 'alert') return alert(ctx);
  return { lead: [RISK_LEAD], rest: [] };
}

/**
 * The lead sentence(s) of an explanation, slotted: the headline value with its meaning ("Você pode pagar
 * {{marginalValue12m}} a menos nos próximos {{horizon}}…"). Our code writes it for every origin; a model only writes
 * what follows, so it can never put a headline number in the wrong sense (ADR-016).
 */
export function leadSource(finding: Finding, audience: Audience = 'owner'): string {
  return curlyQuotes(parts(ctxOf(finding, audience).ctx).lead.join(' '));
}

/** The template as slotted text and the slots that fill it. */
export function templateSource(
  finding: Finding,
  audience: Audience = 'owner',
): { source: string; slots: Slots } {
  const { ctx, slots } = ctxOf(finding, audience);
  const out: string[] = [];
  const doNot = finding.doNot.find(ctx.clean);

  const { lead, rest } = parts(ctx);
  out.push(...lead);
  if (finding.type === 'risk') {
    if (doNot !== undefined) out.push(sentence(doNot));
    out.push('Veja por quê em “Ver cálculo”.');
    return { source: curlyQuotes(out.join(' ')), slots };
  }
  out.push(...rest);

  // A recovery already says "estimativa" beside its range.
  if (!(finding.type === 'recovery' && finding.confidence === 'estimated'))
    out.push(confidence(ctx));

  // The engine's main tradeoff, only if it holds no number and no citation.
  const tradeoff = finding.tradeoffs[0];
  if (tradeoff !== undefined && ctx.clean(tradeoff))
    out.push(sentence(`Contrapartida: ${continueSentence(tradeoff)}`));
  if (doNot !== undefined) out.push(sentence(doNot));

  if (audience === 'accountant') {
    if (finding.refs.length > 0)
      out.push(`Base legal: ${finding.refs.map((_, i) => `{{ref:${i}}}`).join('; ')}.`);
    out.push('O cálculo completo, passo a passo, está no relatório.');
  } else {
    out.push('A conta e a lei estão em “Ver cálculo”.');
  }
  return { source: curlyQuotes(out.join(' ')), slots };
}

/** The deterministic explanation of a finding (pt-BR), rendered. */
export function templateExplanation(finding: Finding, audience: Audience = 'owner'): string {
  const { source, slots } = templateSource(finding, audience);
  return renderSlots(source, slots) as string;
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

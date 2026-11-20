import type { EngineResult, Finding, LegalRef } from '@refund/engine';
import type { ReactNode } from 'react';
import { inputText } from '@/components/brand/calc-trace';
import { confidenceLabel } from '@/components/brand/confidence-badge';
import { DISCLAIMER_TEXT } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { sealLabel } from '@/components/brand/sandbox-seal';
import { traceInputLabel, traceTextValue } from '@/components/brand/trace-labels';
import { displayTitle, findingText, keepCurrency } from '@/features/demo/display';
import { exampleText } from '@/features/live/data-origin';
import { formatBRL, formatRatePercent, formatYearMonth } from '@/lib/format';
import { formatWhen, NO_MONEY_TEXT, RecoveryTable } from './action-plan';
import { ACTOR_LABEL, type DashboardModel, formatCivilDate, stepsByActor } from './model';
import { alertCostLabel } from './text';

// Screen 8, the printable report (IDENTITY-AND-UI §5 Screen 8; no @react-pdf: browser print with print CSS). It is
// the calculation record the accountant receives: totals, each finding's trace, assumptions, citations, the action
// plan grouped by who does it, the DAS-by-DAS table, the regulation versions and the hashes. All engine data.

interface ReportProps {
  company: string;
  holderName?: string;
  analysisDate: string;
  result: EngineResult;
  model: DashboardModel;
  labelOf: (refId: string) => string | undefined;
  /** The approval status line (client), printed under the total. */
  approval?: ReactNode;
  /**
   * /app and /r/[token] (a real company's public data): the footer seal must not say "dados sintéticos"
   * (compliance review G2 M1, same rule as SandboxSeal). /demo leaves it false.
   */
  live?: boolean;
  /** A live analysis's seal from its data origin (features/live/data-origin.ts); wins over `live`. */
  seal?: string;
  /** The data-origin banner text (C2), printed on the paper too: the statements are not the company's. */
  notice?: string | null;
  /** Example statements (bug bash 20/11, C1): no "confirmado" label, alert texts prefixed. */
  example?: boolean;
  /**
   * The company's own Simples annex (from its CNAE), for the one-line note on why the projected DAS differs from the
   * DAS in the statement (bug bash 20/11). Omitted on /demo.
   */
  anexo?: string | null;
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={id}>
      <h2
        id={id}
        className="report-head border-b border-neutral-300 pb-1 text-[15px] font-semibold text-neutral-900"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

type TraceStep = Finding['trace'][number];

function resultText(r: TraceStep['result']): string {
  if (r.unit === 'cents' && typeof r.value === 'number') return formatBRL(r.value);
  if (r.unit === 'rate') return formatRatePercent(String(r.value));
  return traceTextValue('', String(r.value));
}

/**
 * Per-period steps collapse into one compact table (UX review M2: the report fits in few pages). Columns are trace
 * inputs and the result, exactly as the engine wrote them.
 */
const PERIOD_GROUPS: readonly {
  match: RegExp;
  title: string;
  cols: readonly string[];
  result: string;
}[] = [
  { match: /^R01\.PA\./, title: 'Período a período', cols: ['fatorRFull', 'anexo'], result: 'DAS' },
  {
    match: /^PGDAS\.INFERENCE\./,
    title: 'Como cada PGDAS-D foi declarado (deduzido do DAS pago)',
    cols: ['paid'],
    result: 'Declarado',
  },
  {
    match: /^R05\.DAS\./,
    title: 'DAS com a exportação separada',
    cols: ['dasNotSegregated'],
    result: 'DAS separando',
  },
  {
    match: /^R05-REC\.OVERPAYMENT\./,
    title: 'Pago a mais, mês a mês',
    cols: ['paid', 'segregated'],
    result: 'Pago a mais',
  },
];

type Block =
  | { kind: 'step'; step: TraceStep }
  | { kind: 'group'; group: (typeof PERIOD_GROUPS)[number]; steps: TraceStep[] };

function blocksOf(trace: readonly TraceStep[]): Block[] {
  const out: Block[] = [];
  for (const step of trace) {
    const group = PERIOD_GROUPS.find((g) => g.match.test(step.id));
    const last = out.at(-1);
    if (group && last?.kind === 'group' && last.group === group) last.steps.push(step);
    else if (group) out.push({ kind: 'group', group, steps: [step] });
    else out.push({ kind: 'step', step });
  }
  return out;
}

function GroupTable({
  group,
  steps,
}: {
  group: (typeof PERIOD_GROUPS)[number];
  steps: TraceStep[];
}) {
  const first = steps[0];
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[12px] font-medium text-neutral-800">
        {group.title}
        {first?.ref ? (
          <span className="font-normal text-neutral-600"> · {first.ref.label}</span>
        ) : null}
      </p>
      <table className="w-full text-left text-[11px] text-neutral-800">
        <thead className="text-neutral-600">
          <tr>
            <th scope="col" className="py-0.5 pr-3 font-medium">
              Período
            </th>
            {group.cols.map((c) => (
              <th key={c} scope="col" className="py-0.5 pr-3 text-right font-medium">
                {traceInputLabel(c) ?? ''}
              </th>
            ))}
            <th scope="col" className="py-0.5 text-right font-medium">
              {group.result}
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => (
            <tr key={s.id} className="border-t border-neutral-200">
              <td className="num py-0.5 pr-3">{s.month ? formatYearMonth(s.month) : s.id}</td>
              {group.cols.map((c) => {
                const input = s.inputs[c];
                return (
                  <td key={c} className="num py-0.5 pr-3 text-right whitespace-nowrap">
                    {input ? inputText(c, input) : ''}
                  </td>
                );
              })}
              <td className="num py-0.5 text-right whitespace-nowrap">{resultText(s.result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TraceTable({ f }: { f: Finding }) {
  const blocks = blocksOf(f.trace);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b) =>
        b.kind === 'group' ? (
          <GroupTable key={b.steps[0]?.id ?? b.group.title} group={b.group} steps={b.steps} />
        ) : null,
      )}
      <table className="w-full text-left text-[12px] text-neutral-800">
        <thead className="text-neutral-600">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">
              Passo
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              Fórmula
            </th>
            <th scope="col" className="py-1 pr-3 text-right font-medium">
              Resultado
            </th>
            <th scope="col" className="py-1 font-medium">
              Norma
            </th>
          </tr>
        </thead>
        <tbody>
          {blocks.flatMap((b) =>
            b.kind === 'step'
              ? [
                  <tr key={b.step.id} className="border-t border-neutral-200 align-top">
                    <td className="py-1 pr-3">{b.step.label}</td>
                    <td className="py-1 pr-3 font-mono text-[11px] text-neutral-600">
                      {b.step.formula}
                    </td>
                    <td className="num py-1 pr-3 text-right whitespace-nowrap">
                      {resultText(b.step.result)}
                    </td>
                    <td className="py-1 text-neutral-600">{b.step.ref?.label ?? ''}</td>
                  </tr>,
                ]
              : [],
          )}
        </tbody>
      </table>
    </div>
  );
}

function Scroll({ children }: { children: ReactNode }) {
  return (
    <section
      className="overflow-x-auto"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (axe scrollable-region-focusable)
      tabIndex={0}
      aria-label="Cálculo"
    >
      {children}
    </section>
  );
}

function FindingBlock({
  f,
  n,
  value,
  example,
}: {
  f: Finding;
  n: number;
  value: ReactNode;
  example: boolean;
}) {
  const alertish = f.type === 'alert' || f.type === 'risk';
  return (
    <li className="flex flex-col gap-2" data-testid={`report-finding-${f.ruleId}`}>
      <p className="report-head flex flex-wrap items-baseline justify-between gap-2 text-[14px] font-semibold">
        <span>
          {n}. {displayTitle(f.ruleId, f.title)}
        </span>
        {value}
      </p>
      <p className="text-[12px] text-neutral-700">
        <span className="font-medium" data-testid={`report-confidence-${f.ruleId}`}>
          Confiança: {confidenceLabel(f.confidence, example)}
        </span>{' '}
        · {keepCurrency(exampleText(findingText(f), example && alertish))}
      </p>
      <Scroll>
        <TraceTable f={f} />
      </Scroll>
    </li>
  );
}

const byValue = (a: Finding, b: Finding) =>
  b.marginalValue12m - a.marginalValue12m || a.order - b.order;

export function Report({
  company,
  holderName,
  analysisDate,
  result,
  model,
  labelOf,
  approval,
  live = false,
  seal,
  notice,
  example = false,
  anexo = null,
}: ReportProps) {
  // One order everywhere (UX review): biggest effect first, ties in the engine order.
  const savings = result.findings.filter((f) => f.type === 'savings').sort(byValue);
  const counted = savings.filter((f) => f.countsInTotal && f.confidence === 'confirmed');
  const estimated = savings.filter((f) => !counted.includes(f));
  const recovery = result.findings.filter((f) => f.type === 'recovery');
  const alerts = result.findings
    .filter((f) => f.type === 'alert' || f.type === 'risk')
    .sort(byValue);
  const citations = new Map<string, LegalRef>();
  for (const f of result.findings) for (const r of f.refs) citations.set(r.id, r);
  const assumptions = [...new Set(result.findings.flatMap((f) => f.assumptionsUsed))];
  const groups = stepsByActor(result.findings);
  const items = recovery.flatMap((f) => f.recoveryItems ?? []);
  const anchor = `na data da análise (${formatCivilDate(analysisDate)})`;

  return (
    <article
      data-testid="report-paper"
      className="report-paper mx-auto flex w-full max-w-[794px] flex-col gap-7 rounded-md border border-border bg-white p-6 text-neutral-900 shadow-md sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 text-[20px] text-neutral-900">
          <Logo />
          <span className="text-[13px] text-neutral-600">Memória de cálculo</span>
        </div>
        <p className="text-[14px] text-neutral-700">
          {company}
          {holderName ? ` + ${holderName}` : ''} · análise de {formatCivilDate(analysisDate)}
        </p>
        {notice ? (
          <p
            className="rounded-[2px] border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] font-medium text-neutral-900"
            data-testid="report-origin"
          >
            {notice}
          </p>
        ) : null}
        <p className="flex flex-wrap items-baseline gap-x-3 text-neutral-900">
          <span className="text-[13px] text-neutral-600">
            Total, próximos 12 meses ({example ? 'confirmado no extrato de exemplo' : 'confirmado'}
            ):
          </span>
          <mark
            className="num rounded-[2px] bg-found px-1 text-[28px] leading-9 font-semibold text-neutral-900"
            data-testid="report/total"
            data-cents={model.total}
          >
            {formatBRL(model.total)}
          </mark>
        </p>
        {model.annual ? (
          <p className="num text-[13px] text-neutral-700" data-cents={model.annual}>
            e {formatBRL(model.annual)} por ano
            {model.regimeFrom ? ` a partir de ${formatYearMonth(model.regimeFrom)}` : ''}
          </p>
        ) : model.annualPending ? (
          <p className="text-[13px] text-neutral-700">
            Valor por ano aparece quando tudo estiver confirmado.
          </p>
        ) : null}
        {model.recoveryRange ? (
          // UX review G2 L6: the whole recovery range on the first page, apart from the total.
          <p
            className="num text-[13px] text-neutral-700"
            data-testid="report/recovery"
            data-cents-min={model.recoveryRange[0]}
            data-cents-max={model.recoveryRange[1]}
          >
            Para recuperar, fora do total: {formatBRL(model.recoveryRange[0])} a{' '}
            {formatBRL(model.recoveryRange[1])} (estimativa)
          </p>
        ) : null}
        {anexo ? (
          <p className="text-[12px] text-neutral-700" data-testid="report-anexo-note">
            O DAS projetado é calculado pelo Anexo {anexo} da sua atividade
            {example ? '; o DAS pago que aparece no extrato é o do exemplo' : ''}.
          </p>
        ) : null}
        {approval}
      </header>

      {counted.length > 0 ? (
        <Section title="Achados que entram no total (confirmados)" id="r-achados">
          <ol className="flex flex-col gap-5">
            {counted.map((f, i) => (
              <FindingBlock
                key={f.ruleId}
                example={example}
                f={f}
                n={i + 1}
                value={
                  <span className="num" data-cents={f.marginalValue12m}>
                    {formatBRL(f.marginalValue12m)}
                  </span>
                }
              />
            ))}
          </ol>
        </Section>
      ) : null}

      {estimated.length > 0 ? (
        <Section title="Estimados (fora do número)" id="r-estimados">
          <ol className="flex flex-col gap-5">
            {estimated.map((f, i) => (
              <FindingBlock
                key={f.ruleId}
                example={example}
                f={f}
                n={i + 1}
                value={
                  <span className="num" data-cents={f.marginalValue12m}>
                    {formatBRL(f.marginalValue12m)}
                  </span>
                }
              />
            ))}
          </ol>
        </Section>
      ) : null}

      {recovery.length > 0 ? (
        <Section title="Para recuperar (fora do total)" id="r-recuperar">
          {recovery.map((f) => (
            <div key={f.ruleId} className="flex flex-col gap-2">
              <p className="text-[12px] font-medium text-neutral-700">
                Confiança: {confidenceLabel(f.confidence, example)}
              </p>
              {f.range ? (
                <p
                  className="num text-[14px] font-semibold"
                  data-cents-min={f.range[0]}
                  data-cents-max={f.range[1]}
                >
                  {formatBRL(f.range[0])} a {formatBRL(f.range[1])}
                </p>
              ) : null}
              <p className="text-[12px] text-neutral-700">{keepCurrency(f.title)}</p>
              <section
                className="overflow-x-auto"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (axe scrollable-region-focusable)
                tabIndex={0}
                aria-label="Cálculo"
              >
                <TraceTable f={f} />
              </section>
            </div>
          ))}
        </Section>
      ) : null}

      {alerts.length > 0 ? (
        <Section title="Riscos e alertas (fora do total)" id="r-alertas">
          <ol className="flex flex-col gap-5">
            {alerts.map((f, i) => (
              <FindingBlock
                key={f.ruleId}
                example={example}
                f={f}
                n={i + 1}
                value={
                  f.marginalValue12m > 0 ? (
                    <span className="num" data-cents={f.marginalValue12m}>
                      {alertCostLabel(f.title)}: {formatBRL(f.marginalValue12m)}
                    </span>
                  ) : (
                    <span className="text-[12px] font-normal text-neutral-600">
                      {f.type === 'risk' ? 'risco' : 'alerta'}
                      {f.howToReceive.length === 0 ? ` · ${NO_MONEY_TEXT}` : ''}
                    </span>
                  )
                }
              />
            ))}
          </ol>
        </Section>
      ) : null}

      {groups.length > 0 || items.length > 0 ? (
        <Section title="Plano de ação" id="r-plano">
          <div className="flex flex-col gap-4" data-testid="report-plan">
            {groups.map((g) => (
              <div key={g.who} className="flex flex-col gap-2" data-testid={`report-plan-${g.who}`}>
                <h3 className="text-[13px] font-semibold">{ACTOR_LABEL[g.who]}</h3>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[12px]">
                  {g.steps.map(({ title, step }) => (
                    <li
                      key={step.id}
                      className={step.noSource ? 'text-neutral-500 italic' : undefined}
                    >
                      <span className="text-neutral-500">{title}: </span>
                      {step.what}
                      {step.where ? (
                        <span className="text-neutral-600">
                          {' '}
                          Onde: {step.where.name}
                          {step.where.path ? ` › ${step.where.path}` : ''}.
                        </span>
                      ) : null}
                      {step.until ? (
                        <span className="text-neutral-600"> Prazo: {formatWhen(step.until)}.</span>
                      ) : null}
                      {step.refIds.length > 0 ? (
                        <span className="text-neutral-500">
                          {' '}
                          ({step.refIds.map(labelOf).filter(Boolean).join('; ')})
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {items.length > 0 ? (
              <div className="report-table text-neutral-900">
                <h3 className="text-[13px] font-semibold">DAS por DAS</h3>
                <RecoveryTable items={items} anchor={anchor} open />
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {assumptions.length > 0 ? (
        <Section title="Premissas" id="r-premissas">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[12px]">
            {assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      {citations.size > 0 ? (
        <Section title="Citações" id="r-citacoes">
          <ul className="flex flex-col gap-1 text-[12px]" data-testid="report-citations">
            {[...citations.values()].map((r) => (
              <li key={r.id} className="break-words">
                {r.label} · <span className="text-neutral-600">{r.url}</span> · conferido em{' '}
                {formatCivilDate(r.verifiedAt)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="report-print-footer hidden text-[9px] text-neutral-500 print:block">
        Refund · memória de cálculo · normas {result.parametersVersion} · hash{' '}
        {result.parametersHash.replace(/^sha256:/, '').slice(0, 12)}
      </div>
      <footer className="flex flex-col gap-1 border-t border-neutral-300 pt-3 text-[11px] text-neutral-600">
        <p>
          Versão das normas {result.parametersVersion} · motor {result.engineVersion}
        </p>
        <p className="font-mono break-all" data-testid="report-hash">
          Hash dos parâmetros {result.parametersHash} · hash das entradas {result.inputsHash}
        </p>
        <p data-testid="report-seal">
          {DISCLAIMER_TEXT} {seal ?? sealLabel(live)}.
        </p>
      </footer>
    </article>
  );
}

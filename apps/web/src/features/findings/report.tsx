import type { EngineResult, Finding, LegalRef } from '@refund/engine';
import type { ReactNode } from 'react';
import { DISCLAIMER_TEXT } from '@/components/brand/disclaimer';
import { Logo } from '@/components/brand/logo';
import { keepCurrency, shortTitle } from '@/features/demo/display';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { formatWhen, NO_MONEY_TEXT, RecoveryTable } from './action-plan';
import { ACTOR_LABEL, type DashboardModel, formatCivilDate, stepsByActor } from './model';

// Screen 8, the printable report (IDENTITY-AND-UI §5 Screen 8; no @react-pdf: browser print with print CSS). It is
// the calculation record the accountant receives: totals, each finding's trace, assumptions, citations, the action
// plan grouped by who does it, the DAS-by-DAS table, the regulation versions and the hashes. All engine data.

interface ReportProps {
  company: string;
  holderName: string;
  analysisDate: string;
  result: EngineResult;
  model: DashboardModel;
  labelOf: (refId: string) => string | undefined;
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="flex break-inside-avoid-page flex-col gap-3" aria-labelledby={id}>
      <h2
        id={id}
        className="border-b border-neutral-300 pb-1 text-[15px] font-semibold text-neutral-900"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function TraceTable({ f }: { f: Finding }) {
  return (
    <table className="w-full text-left text-[12px] text-neutral-800">
      <thead className="text-neutral-500">
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
        {f.trace.map((s) => (
          <tr key={s.id} className="border-t border-neutral-200 align-top">
            <td className="py-1 pr-3">{s.label}</td>
            <td className="py-1 pr-3 font-mono text-[11px] text-neutral-600">{s.formula}</td>
            <td className="num py-1 pr-3 text-right whitespace-nowrap">
              {s.result.unit === 'cents' && typeof s.result.value === 'number'
                ? formatBRL(s.result.value)
                : String(s.result.value)}
            </td>
            <td className="py-1 text-neutral-600">{s.ref?.label ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Report({ company, holderName, analysisDate, result, model, labelOf }: ReportProps) {
  const counted = result.findings.filter((f) => f.type === 'savings' && f.countsInTotal);
  const recovery = result.findings.filter((f) => f.type === 'recovery');
  const alerts = result.findings.filter((f) => f.type === 'alert' || f.type === 'risk');
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
          {company} + {holderName} · análise de {formatCivilDate(analysisDate)}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3 text-neutral-900">
          <span className="text-[13px] text-neutral-600">
            Total, próximos 12 meses (confirmado):
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
        ) : null}
      </header>

      <Section title="Achados que entram no total" id="r-achados">
        <ol className="flex flex-col gap-5">
          {counted.map((f, i) => (
            <li
              key={f.ruleId}
              className="flex flex-col gap-2"
              data-testid={`report-finding-${f.ruleId}`}
            >
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-[14px] font-semibold">
                <span>
                  {i + 1}. {shortTitle(f.ruleId, f.title)}
                </span>
                <span className="num" data-cents={f.marginalValue12m}>
                  {formatBRL(f.marginalValue12m)}
                </span>
              </p>
              <p className="text-[12px] text-neutral-700">{keepCurrency(f.title)}</p>
              <TraceTable f={f} />
            </li>
          ))}
        </ol>
      </Section>

      {recovery.length > 0 ? (
        <Section title="Para recuperar (estimativa, fora do total)" id="r-recuperar">
          {recovery.map((f) => (
            <div key={f.ruleId} className="flex flex-col gap-2">
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
              <TraceTable f={f} />
            </div>
          ))}
        </Section>
      ) : null}

      {alerts.length > 0 ? (
        <Section title="Riscos e alertas (fora do total)" id="r-alertas">
          <ul className="flex flex-col gap-2 text-[13px]">
            {alerts.map((f) => (
              <li key={f.ruleId}>
                <span className="font-medium">{f.type === 'risk' ? 'Risco' : 'Alerta'}:</span>{' '}
                {keepCurrency(f.title)}
                {f.howToReceive.length === 0 ? (
                  <span className="text-neutral-600"> {NO_MONEY_TEXT}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Plano de ação" id="r-plano">
        <div className="flex flex-col gap-4" data-testid="report-plan">
          {groups.map((g) => (
            <div key={g.who} className="flex flex-col gap-2" data-testid={`report-plan-${g.who}`}>
              <h3 className="text-[13px] font-semibold">{ACTOR_LABEL[g.who]}</h3>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[12px]">
                {g.steps.map(({ ruleId, title, step }) => (
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
                    <span className="sr-only"> ({ruleId})</span>
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

      <Section title="Premissas" id="r-premissas">
        <ul className="flex list-disc flex-col gap-1 pl-5 text-[12px]">
          {assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Section>

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

      <footer className="flex flex-col gap-1 border-t border-neutral-300 pt-3 text-[11px] text-neutral-600">
        <p>
          Versão das normas {result.parametersVersion} · motor {result.engineVersion}
        </p>
        <p className="font-mono break-all" data-testid="report-hash">
          Hash dos parâmetros {result.parametersHash} · hash das entradas {result.inputsHash}
        </p>
        <p>{DISCLAIMER_TEXT} Dados sintéticos · Open Finance sandbox.</p>
      </footer>
    </article>
  );
}

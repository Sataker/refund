import type { ActionStep, Finding, HowToReceive, RecoveryItem } from '@refund/engine';
import { MapPin, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ACTOR_LABEL, formatCivilDate, URGENT_DAYS, urgencyOf, urgencyText } from './model';
import { type Excerpt, RefSheet } from './ref-sheet';

// Screen 6b, "Como aplicar" / "Como receber" (IDENTITY-AND-UI Screen 6b; ENGINE-SPEC C.12). It renders the engine's
// actionPlan, howToReceive and recoveryItems exactly as they come: steps in the catalog order, the engine's text and
// dates, the refs of each step. The web writes no step, date or regulation; titles, chips and headers are UI copy.

const METHOD_LABEL: Readonly<Record<HowToReceive['method'], string>> = {
  lower_tax: 'Imposto menor',
  refund_pix_cnpj: 'Receita Federal',
  refund_municipality: 'Prefeitura',
  refund_state: 'Estado',
  offset: 'Compensação',
  irpf_refund: 'Restituição do IRPF',
};

/** Fixed text of C.12 for `howToReceive: []` (alerts and risks). */
export const NO_MONEY_TEXT = 'Não há valor a receber: é um risco evitado.';

/** "2026-12" → "dez/2026"; "2026-11-23" → "23/11/2026". */
export function formatWhen(when: string): string {
  return when.length === 7 ? formatYearMonth(when) : formatCivilDate(when);
}

export function planTitle(type: Finding['type']): string {
  if (type === 'recovery') return 'Como receber';
  if (type === 'savings') return 'Como aplicar';
  return 'O que fazer';
}

function Refs({ ids, excerpts }: { ids: readonly string[]; excerpts: Record<string, Excerpt> }) {
  const found = ids.map((id) => excerpts[id]).filter((e): e is Excerpt => e !== undefined);
  if (found.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {found.map((e) => (
        <RefSheet key={e.id} excerpt={e} className="open:basis-full" />
      ))}
    </div>
  );
}

interface ActionPlanProps {
  finding: Pick<Finding, 'ruleId' | 'type' | 'actionPlan' | 'howToReceive' | 'recoveryItems'>;
  excerpts: Record<string, Excerpt>;
  /** `Facts.analysisDate`: every daysLeft is anchored to it (/demo freezes 12/11/2026). */
  analysisDate: string;
  /** Client actions (send to the accountant, copy). */
  actions?: ReactNode;
  /** Show only the first N steps; the rest open with "Ver os {n} passos" (UX review H1). */
  collapseAfter?: number;
}

/** UX review M4: savings say when the effect starts; only recovery and refunds say when the money arrives. */
function whenTitle(type: Finding['type']): string {
  return type === 'savings' ? 'Quando o efeito começa' : 'Quando o dinheiro chega';
}

export function ActionPlan({
  finding,
  excerpts,
  analysisDate,
  actions,
  collapseAfter,
}: ActionPlanProps) {
  const steps = [...finding.actionPlan].sort((a, b) => a.order - b.order);
  const cut =
    collapseAfter !== undefined && steps.length > collapseAfter ? collapseAfter : steps.length;
  const urgency = urgencyOf(finding.recoveryItems);
  const anchor = `na data da análise (${formatCivilDate(analysisDate)})`;
  return (
    <section
      aria-labelledby="plano-titulo"
      data-testid="action-plan"
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm lg:p-6"
    >
      <h2 id="plano-titulo" className="type-h4 text-foreground">
        {planTitle(finding.type)}
      </h2>

      <div className="flex flex-col gap-2">
        {finding.howToReceive.length === 0 ? (
          // L3: the fixed C.12 sentence replaces the heading (there is no money to arrive).
          <p className="text-base text-foreground" data-testid="no-money">
            {NO_MONEY_TEXT}
          </p>
        ) : (
          <h3 className="type-small font-medium text-muted-foreground">
            {whenTitle(finding.type)}
          </h3>
        )}
        {finding.howToReceive.length === 0 ? null : (
          <ul className="flex flex-col gap-3" data-testid="how-to-receive">
            {finding.howToReceive.map((h) => (
              <li key={h.method} className="grid grid-cols-[12px_1fr] gap-x-3">
                <span className="mt-2 size-2 rounded-full bg-found-chart" aria-hidden="true" />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="text-base text-foreground">
                    <span className="font-medium">{METHOD_LABEL[h.method]}:</span> {h.summary}
                    {h.firstEffect ? (
                      <span className="text-muted-foreground">
                        {' '}
                        Primeiro efeito: {formatWhen(h.firstEffect)}.
                      </span>
                    ) : null}
                  </p>
                  <Refs ids={h.refIds} excerpts={excerpts} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {urgency ? (
        <p
          data-testid="urgency-line"
          className="type-small flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-warning-soft px-3 py-2 text-foreground"
        >
          <Timer className="size-4 shrink-0 text-warning" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-medium">{urgencyText(urgency)}</span>
          <span className="text-muted-foreground">{anchor}</span>
        </p>
      ) : null}

      <ol className="flex flex-col gap-4" data-testid="action-steps">
        {steps.slice(0, cut).map((s, i) => (
          <StepItem key={s.id} s={s} n={i + 1} excerpts={excerpts} />
        ))}
      </ol>
      {cut < steps.length ? (
        <details className="group/steps" data-testid="more-steps">
          <summary className="type-small inline-flex min-h-11 cursor-pointer list-none items-center font-medium text-cobalt [&::-webkit-details-marker]:hidden">
            <span className="group-open/steps:hidden">
              {steps.length - cut === 1
                ? 'Ver mais 1 passo'
                : `Ver mais ${steps.length - cut} passos`}
            </span>
            <span className="hidden group-open/steps:inline">Mostrar menos</span>
          </summary>
          <ol className="mt-3 flex flex-col gap-4" start={cut + 1}>
            {steps.slice(cut).map((s, i) => (
              <StepItem key={s.id} s={s} n={cut + i + 1} excerpts={excerpts} />
            ))}
          </ol>
        </details>
      ) : null}

      {finding.recoveryItems?.length ? (
        <RecoveryTable items={finding.recoveryItems} anchor={anchor} />
      ) : null}

      {actions}
    </section>
  );
}

function StepItem({
  s,
  n,
  excerpts,
}: {
  s: ActionStep;
  n: number;
  excerpts: Record<string, Excerpt>;
}) {
  return (
    <li
      data-testid="action-step"
      data-step-id={s.id}
      data-no-source={s.noSource === true ? 'true' : undefined}
      className="grid grid-cols-[28px_1fr] gap-x-3"
    >
      <span
        className="type-caption num flex size-7 items-center justify-center rounded-full border border-strong-border text-muted-foreground"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="type-caption self-start rounded-sm bg-surface-2 px-1.5 py-0.5 font-medium text-foreground">
          {ACTOR_LABEL[s.who]}
        </span>
        <p
          className={cn(
            'text-base',
            s.noSource ? 'text-muted-foreground italic' : 'text-foreground',
          )}
        >
          {s.what}
        </p>
        {s.where ? (
          <p className="type-small flex flex-wrap items-baseline gap-x-2 text-muted-foreground">
            <MapPin
              className="size-3.5 shrink-0 self-center"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            {s.where.url ? (
              <a
                href={s.where.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-cobalt underline-offset-4 hover:underline"
              >
                {s.where.name}
              </a>
            ) : (
              <span className="font-medium text-foreground">{s.where.name}</span>
            )}
            {s.where.path ? <span className="type-mono break-words">{s.where.path}</span> : null}
          </p>
        ) : null}
        {s.from || s.until ? (
          <p className="type-small num text-muted-foreground">
            {s.from ? `A partir de ${formatWhen(s.from)}` : ''}
            {s.from && s.until ? ' · ' : ''}
            {s.until ? `prazo ${formatWhen(s.until)}` : ''}
          </p>
        ) : null}
        {s.documents?.length ? (
          <ul className="type-small list-disc pl-5 text-muted-foreground">
            {s.documents.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        <Refs ids={s.refIds} excerpts={excerpts} />
      </div>
    </li>
  );
}

/** The DAS-by-DAS table (Screen 6b "Ver 60 meses"): the engine's order (by claimUntil), urgent rows in `risk`. */
export function RecoveryTable({
  items,
  anchor,
  open = false,
}: {
  items: readonly RecoveryItem[];
  anchor: string;
  open?: boolean;
}) {
  return (
    <details open={open} className="group/tbl" data-testid="recovery-details">
      <summary className="type-small inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-medium text-cobalt [&::-webkit-details-marker]:hidden">
        <span className="group-open/tbl:hidden">Ver {items.length} meses, DAS por DAS</span>
        <span className="hidden group-open/tbl:inline">Esconder a tabela</span>
      </summary>
      <p className="type-caption mt-1 text-muted-foreground">
        Dias restantes contados {anchor}. Meses estimados usam a data de vencimento; confira a data
        do pagamento no extrato do DAS.
      </p>
      <section
        className="mt-2 max-h-[28rem] overflow-auto rounded-md border border-border"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (axe scrollable-region-focusable)
        tabIndex={0}
        aria-label="Tabela DAS por DAS"
      >
        <table className="type-small w-full min-w-[640px] text-left" data-testid="recovery-table">
          <caption className="sr-only">Recuperação DAS por DAS</caption>
          <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
            <tr>
              {[
                'Período',
                'Pago em',
                'Federal',
                'ISS',
                'Pedir a partir de',
                'Pedir até',
                'Dias',
                'Base',
              ].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const urgent = it.daysLeft <= URGENT_DAYS;
              return (
                <tr
                  key={it.pa}
                  data-testid="recovery-row"
                  data-urgent={urgent ? 'true' : undefined}
                  className={cn('border-t border-border num', urgent && 'bg-risk-soft text-risk')}
                >
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatYearMonth(it.pa)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {it.paymentDate ? formatCivilDate(it.paymentDate) : 'estimado'}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap" data-cents={it.federal}>
                    {formatBRL(it.federal)}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap" data-cents={it.iss}>
                    {formatBRL(it.iss)}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{formatYearMonth(it.claimFrom)}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {formatCivilDate(it.claimUntil)}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{it.daysLeft}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {it.measured ? 'medido' : 'estimado'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </details>
  );
}

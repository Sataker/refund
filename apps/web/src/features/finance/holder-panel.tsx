import { Diamond } from 'lucide-react';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CategoryList } from './category-list.client.tsx';
import { MonthBars, type MonthBarsSeries } from './month-bars.client.tsx';
import { SealMark } from './seal-style.tsx';
import { FinanceSection } from './section.client.tsx';
import { comparedTo, listDates, shortMonth, signedBRL } from './text.ts';
import type { ChargeRow, FinanceScreenData, GroupLine, HolderView } from './types.ts';

// One holder of Screen 5b, hierarchy items 2–9. Every number is the builder's; this file only formats.

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-5)',
  'var(--chart-4)',
  'var(--chart-3)',
];
const NET_BASIS_NOTE =
  'Pró-labore e distribuições aparecem líquidos, como saíram da conta. Os achados usam os valores brutos que você confirmou.';
const AI_NOTE = 'Classificado por IA. Sem a sua confirmação, não gera selo.';

function Tile({
  label,
  cents,
  testId,
  sub,
  className,
}: {
  label: string;
  cents: number;
  testId: string;
  sub: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-3 shadow-xs lg:p-4',
        className,
      )}
    >
      <span className="type-small text-muted-foreground">{label}</span>
      <span
        data-testid={testId}
        data-cents={cents}
        className="num text-[18px] leading-6 font-semibold tracking-[-0.02em] text-foreground lg:text-[26px] lg:leading-8"
      >
        {formatBRL(cents)}
      </span>
      <span className="type-small text-muted-foreground">{sub}</span>
    </div>
  );
}

function seriesOf(groups: readonly GroupLine[]): MonthBarsSeries[] {
  return groups
    .filter((g) => g.direction === 'outflow')
    .map((g, i) => ({
      key: g.groupId,
      label: g.label,
      color: CHART_COLORS[i] ?? null,
      cents: g.byMonth.map((m) => m.cents),
    }));
}

function amountLine(row: ChargeRow): string {
  return row.occurrences === 1
    ? `${formatBRL(row.amount)} · ${listDates([row.lastDate])}`
    : `${formatBRL(row.amount)} × ${row.occurrences} · ${formatBRL(row.total)}`;
}

function ChargeList({
  rows,
  groups,
  testId,
  showCounterparty,
}: {
  rows: ChargeRow[];
  groups: readonly GroupLine[];
  testId: string;
  showCounterparty: 'primary' | 'secondary';
}) {
  const byId = new Map(groups.map((g) => [g.groupId, g]));
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((r) => {
        const group = byId.get(r.groupId);
        const primary = showCounterparty === 'primary' ? r.label : (group?.label ?? r.label);
        const secondary =
          showCounterparty === 'primary' ? group?.label : r.label === primary ? undefined : r.label;
        const risk = group?.seals.find((s) => s.kind === 'risk');
        return (
          <li
            key={r.key}
            data-testid={`${testId}-row`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5"
          >
            <span className="flex min-w-0 flex-col">
              <span className="type-small truncate font-medium text-foreground">{primary}</span>
              {secondary === undefined ? null : (
                <span className="type-caption truncate text-muted-foreground">{secondary}</span>
              )}
            </span>
            <span className="flex items-center gap-3">
              {risk === undefined ? null : <SealMark kind="risk" />}
              <span className="num type-small text-right text-foreground" data-cents={r.total}>
                {amountLine(r)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function HolderPanel({ data, holder }: { data: FinanceScreenData; holder: HolderView }) {
  const { view } = data;
  const outflows = holder.groups.filter((g) => g.direction === 'outflow');
  const inflows = holder.groups.filter((g) => g.direction === 'inflow');
  const change = holder.outflowChange;
  const anyLlm = holder.groups.some((g) => g.byOrigin.llm > 0);
  const groupLabel = new Map(holder.groups.map((g) => [g.groupId, g]));
  const key = holder.holder === 'PJ' ? 'pj' : 'pf';
  const list = (groups: GroupLine[]) => (
    <CategoryList
      groups={groups}
      findings={data.findings}
      transactions={data.transactions}
      confirmHref={data.links.confirm}
      holder={key}
    />
  );

  return (
    <div className="flex flex-col gap-8" data-testid={`fv-panel-${key}`}>
      <section
        aria-label="Totais de 12 meses e do último mês"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        <Tile
          label="Entrou"
          cents={holder.inflow12m}
          testId="fv-total-inflow"
          sub="12 meses"
          className="order-2 lg:order-1"
        />
        <Tile
          label="Saiu"
          cents={holder.outflow12m}
          testId="fv-total-outflow"
          sub="12 meses"
          className="order-1 lg:order-2"
        />
        <Tile
          label={formatYearMonth(change.month)}
          cents={change.cents}
          testId="fv-last-month"
          sub={`saíram · ${comparedTo(change.deltaCents, change.previousMonth)}`}
          className="order-3 col-span-2 lg:col-span-1"
        />
      </section>

      {holder.outflow12m > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby={`fv-${key}-chart`}>
          <h2 id={`fv-${key}-chart`} className="type-small font-medium text-muted-foreground">
            Saídas por mês
          </h2>
          <MonthBars
            months={view.months.map(shortMonth)}
            series={seriesOf(holder.groups)}
            summary={`Saídas por mês de ${formatYearMonth(view.months[0] ?? change.month)} a ${formatYearMonth(change.month)}, por categoria`}
          />
        </section>
      ) : null}

      {outflows.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby={`fv-${key}-out`}>
          <h2 id={`fv-${key}-out`} className="type-h4 text-foreground">
            Por categoria <span className="font-normal text-muted-foreground">· saídas</span>
          </h2>
          {list(outflows)}
          {holder.holder === 'PJ' ? (
            <p
              data-testid="fv-net-basis-note"
              className="type-small max-w-[68ch] text-muted-foreground"
            >
              {NET_BASIS_NOTE}
            </p>
          ) : null}
          {anyLlm ? (
            <p className="type-small inline-flex items-center gap-1.5 text-muted-foreground">
              <Diamond className="size-3" aria-hidden="true" />
              {AI_NOTE}
            </p>
          ) : null}
        </section>
      ) : null}

      {inflows.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby={`fv-${key}-in`}>
          <h2 id={`fv-${key}-in`} className="type-h4 text-foreground">
            Por categoria <span className="font-normal text-muted-foreground">· entradas</span>
          </h2>
          {list(inflows)}
        </section>
      ) : null}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-x-10">
        <FinanceSection
          title="O que mudou"
          summary={holder.highlights.length === 0 ? 'nada subiu' : undefined}
          testId="fv-highlights"
          attrs={{ 'data-count': holder.highlights.length }}
        >
          {holder.highlights.length === 0 ? (
            <p className="type-small text-muted-foreground">
              As saídas não subiram de um mês para o outro.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {holder.highlights.map((h) => {
                const i = view.months.indexOf(h.month);
                const previous = view.months[i - 1];
                const g = groupLabel.get(h.driver.groupId);
                return (
                  <li
                    key={h.month}
                    className="flex flex-col gap-1 py-2.5"
                    data-testid="fv-highlight"
                  >
                    <span className="type-small text-foreground">
                      {formatYearMonth(h.month)}:{' '}
                      <a
                        href={`#grupo-${g?.slug ?? ''}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {g?.label ?? h.driver.groupId}
                      </a>{' '}
                      <span className="num font-medium" data-cents={h.driver.deltaCents}>
                        {signedBRL(h.driver.deltaCents)}
                      </span>
                      {previous === undefined ? null : ` em relação a ${formatYearMonth(previous)}`}
                    </span>
                    {g === undefined || g.seals.length === 0 ? null : (
                      <span className="flex flex-wrap gap-3">
                        {g.seals.map((s) => (
                          <SealMark key={s.kind} kind={s.kind} />
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </FinanceSection>

        <FinanceSection
          title="Maiores saídas"
          testId="fv-biggest"
          attrs={{ 'data-count': holder.biggestOutflows.length }}
        >
          <ChargeList
            rows={holder.biggestOutflows}
            groups={holder.groups}
            testId="fv-biggest"
            showCounterparty="secondary"
          />
        </FinanceSection>

        <FinanceSection
          title="Assinaturas e cobranças recorrentes"
          summary={holder.recurring.length === 0 ? 'nenhuma' : String(holder.recurring.length)}
          testId="fv-recurring"
          attrs={{ 'data-count': holder.recurring.length }}
        >
          {holder.recurring.length === 0 ? (
            <p className="type-small text-muted-foreground">
              Nenhuma cobrança recorrente encontrada.
            </p>
          ) : (
            <ChargeList
              rows={holder.recurring}
              groups={holder.groups}
              testId="fv-recurring"
              showCounterparty="primary"
            />
          )}
        </FinanceSection>

        <FinanceSection
          title="Tarifas bancárias"
          summary={holder.fees.rows.length === 0 ? 'nenhuma' : formatBRL(holder.fees.total12m)}
          testId="fv-fees"
          attrs={{ 'data-cents': holder.fees.total12m }}
        >
          {holder.fees.rows.length === 0 ? (
            <p className="type-small text-muted-foreground">Nenhuma tarifa bancária em 12 meses.</p>
          ) : (
            <ChargeList
              rows={holder.fees.rows}
              groups={holder.groups}
              testId="fv-fees"
              showCounterparty="primary"
            />
          )}
        </FinanceSection>

        <FinanceSection
          title="Cobranças em duplicidade"
          summary={holder.duplicates.length === 0 ? 'nenhuma' : String(holder.duplicates.length)}
          testId="fv-duplicates"
          attrs={{ 'data-count': holder.duplicates.length }}
        >
          {holder.duplicates.length === 0 ? (
            <p className="type-small text-muted-foreground">
              Nenhuma cobrança em duplicidade em 12 meses.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {holder.duplicates.map((d) => (
                <li
                  key={d.transactionIds.join(',')}
                  className="flex flex-col gap-1.5 py-2.5"
                  data-testid="fv-duplicate"
                >
                  <span className="type-small text-foreground">
                    Possível cobrança em duplicidade:{' '}
                    <span className="num font-medium" data-cents={d.amount}>
                      {formatBRL(d.amount)}
                    </span>{' '}
                    em {listDates(d.dates)}. Confirme antes de pedir de volta.
                  </span>
                  <a
                    href={
                      d.questionId === undefined
                        ? data.links.confirm
                        : `${data.links.confirm}#${d.questionId}`
                    }
                    className="type-small w-fit font-medium text-cobalt underline-offset-4 hover:underline"
                  >
                    Confirmar →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </FinanceSection>
      </div>
    </div>
  );
}

import { duplicateRemovals } from '@refund/pipeline';
import { Diamond } from 'lucide-react';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CategoryList } from './category-list.client.tsx';
import { RemoveDuplicateButton, UndoExclusionButton } from './exclusions.client.tsx';
import { MonthBars, type MonthBarsSeries } from './month-bars.tsx';
import { SealMark } from './seal-style.tsx';
import { FinanceSection } from './section.client.tsx';
import { comparedTo, countLabel, formatDate, groupKeys, listDates, signedBRL } from './text.ts';
import type {
  AccountLine,
  ChargeRow,
  ExcludedTransaction,
  FinanceScreenData,
  GroupLine,
  HolderView,
} from './types.ts';

// One holder of Screen 5b, hierarchy items 2–9. Every number is the builder's; this file only formats.

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-5)',
  // Ink before violet: Distribuição (chart-1, cobalt) and Pró-labore must not read as the same blue (UX review).
  'var(--chart-3)',
  'var(--chart-4)',
];
const NET_BASIS_NOTE =
  'Pró-labore e distribuições aparecem líquidos, como saíram da conta. Os achados usam os valores brutos que você confirmou.';
const EXCLUDED_NOTE =
  'Remover aqui muda só esta tela. A análise de impostos continua usando o extrato do banco; se a cobrança veio mesmo em dobro, fale com o banco ou com o seu contador.';
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

export function HolderPanel({
  data,
  holder,
  excluded,
}: {
  data: FinanceScreenData;
  holder: HolderView;
  /** [D31 b] The owner's exclusions in this variant (both holders; filtered here). */
  excluded: readonly ExcludedTransaction[];
}) {
  const mine = excluded.filter((e) => e.holder === holder.holder);
  const { view } = data;
  const outflows = holder.groups.filter((g) => g.direction === 'outflow');
  const inflows = holder.groups.filter((g) => g.direction === 'inflow');
  const change = holder.outflowChange;
  const anyLlm = holder.groups.some((g) => g.byOrigin.llm > 0);
  // Highlights and charge rows are outflows: look their group up among the outflow lines.
  const groupLabel = new Map(outflows.map((g) => [g.groupId, g]));
  const keys = groupKeys(holder.groups);
  const sealed = holder.groups.filter((g) => g.seals.length > 0).length;
  const key = holder.holder === 'PJ' ? 'pj' : 'pf';
  const list = (groups: GroupLine[]) => (
    <CategoryList
      groups={groups}
      findings={data.findings}
      transactions={data.transactions}
      confirmHref={data.links.confirm}
      holder={key}
      keys={keys}
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

      {sealed > 0 ? (
        <p className="type-small -mt-4 text-muted-foreground" data-testid="fv-sealed-count">
          <a
            href={`#fv-${key}-out-h`}
            className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4 lg:min-h-0"
          >
            {sealed === 1
              ? '1 categoria tem selo de imposto.'
              : `${sealed} categorias têm selo de imposto.`}
          </a>{' '}
          Toque no selo para ver o achado.
        </p>
      ) : null}

      <Accounts
        accounts={holder.accounts}
        internal={holder.internalTransfers}
        holder={holder.holder}
      />

      {holder.outflow12m > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby={`fv-${key}-chart`}>
          <h2 id={`fv-${key}-chart`} className="type-small font-medium text-muted-foreground">
            Saídas por mês
          </h2>
          <MonthBars
            months={view.months}
            totals={holder.monthly.map((m) => m.outflow)}
            series={seriesOf(holder.groups)}
            summary={`Saídas por mês de ${formatYearMonth(view.months[0] ?? change.month)} a ${formatYearMonth(change.month)}, por categoria`}
          />
        </section>
      ) : null}

      {outflows.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby={`fv-${key}-out-h`}>
          <h2 id={`fv-${key}-out-h`} className="type-h4 scroll-mt-6 text-foreground">
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
                    <a
                      href={`#grupo-${g?.slug ?? ''}`}
                      className="type-small flex min-h-11 items-center text-foreground underline-offset-4 hover:underline lg:min-h-0"
                    >
                      <span>
                        {formatYearMonth(h.month)}:{' '}
                        <span className="font-medium">{g?.label ?? h.driver.groupId}</span>{' '}
                        <span className="num font-medium" data-cents={h.driver.deltaCents}>
                          {signedBRL(h.driver.deltaCents)}
                        </span>
                        {previous === undefined
                          ? null
                          : ` em relação a ${formatYearMonth(previous)}`}
                      </span>
                    </a>
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
            groups={outflows}
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
              groups={outflows}
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
              groups={outflows}
              testId="fv-fees"
              showCounterparty="primary"
            />
          )}
        </FinanceSection>

        <FinanceSection
          title="Cobranças em duplicidade"
          summary={holder.duplicates.length === 0 ? 'nenhuma' : String(holder.duplicates.length)}
          testId="fv-duplicates"
          focusId="fv-duplicates-heading"
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
                  {d.reason === 'same_charge_within_3_days' ? (
                    <span className="type-small text-foreground">
                      Possível pagamento repetido:{' '}
                      <span className="num font-medium" data-cents={d.amount}>
                        {formatBRL(d.amount)}
                      </span>{' '}
                      em {listDates(d.dates)}. Se é o mesmo pagamento listado duas vezes, remova a
                      cópia desta tela. Se o dinheiro saiu mesmo duas vezes, peça de volta a quem
                      recebeu.
                    </span>
                  ) : (
                    <span className="type-small text-foreground">
                      Possível cobrança em duplicidade:{' '}
                      <span className="num font-medium" data-cents={d.amount}>
                        {formatBRL(d.amount)}
                      </span>{' '}
                      em {listDates(d.dates)}. Confirme antes de pedir de volta.
                    </span>
                  )}
                  {d.reason === 'same_charge_within_3_days' ? (
                    // D31 (b): the owner removes the repeat from this view; "Desfazer" brings it back.
                    // Past the /demo cap there is no prebuilt view: the confirmation link stays.
                    <RemoveDuplicateButton
                      ids={duplicateRemovals(d)}
                      testId={`fv-remove-${d.transactionIds[1] ?? ''}`}
                      fallback={
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
                      }
                    />
                  ) : (
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
                  )}
                </li>
              ))}
            </ul>
          )}
          {mine.length === 0 ? null : (
            <div
              className="mt-3 flex flex-col gap-1"
              data-testid="fv-excluded"
              data-count={mine.length}
            >
              <h3
                id="fv-excluded-heading"
                tabIndex={-1}
                className="type-small rounded-sm font-medium text-foreground"
              >
                Removidos por você
              </h3>
              {/* D31 (coordinator, 19/11): the removal never reaches the engine; say so plainly. */}
              <p
                className="type-small max-w-[68ch] text-muted-foreground"
                data-testid="fv-excluded-note"
              >
                {EXCLUDED_NOTE}
              </p>
              <ul className="flex flex-col divide-y divide-border">
                {mine.map((e) => (
                  <li
                    key={e.transactionId}
                    className="flex flex-wrap items-center justify-between gap-x-4 py-1.5"
                  >
                    <span className="type-small text-muted-foreground">
                      {e.label} ·{' '}
                      <span className="num" data-cents={e.amount}>
                        {formatBRL(e.amount)}
                      </span>{' '}
                      · {formatDate(e.date)}
                    </span>
                    <UndoExclusionButton
                      id={e.transactionId}
                      label={`${e.label}, ${formatBRL(e.amount)}, ${formatDate(e.date)}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </FinanceSection>
      </div>
    </div>
  );
}

/**
 * [D31 a] The tiles per bank account. Own-account transfers stay in both tiles (Enzo, 16/11); the line under the
 * list says so, with the builder's own total.
 */
function Accounts({
  accounts,
  internal,
  holder,
}: {
  accounts: readonly AccountLine[];
  internal: HolderView['internalTransfers'];
  holder: 'PF' | 'PJ';
}) {
  if (accounts.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" data-testid="fv-accounts" data-count={accounts.length}>
      <h2 className="type-small font-medium text-muted-foreground">Por conta</h2>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {accounts.map((a) => (
          <li
            key={a.accountId}
            data-testid="fv-account"
            className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-4 py-2.5 lg:grid-cols-[1fr_180px_180px]"
          >
            <span className="type-small col-span-2 flex min-w-0 flex-col break-words font-medium text-foreground lg:col-span-1 lg:block">
              {a.label}
              <span className="font-normal text-muted-foreground">
                <span className="hidden lg:inline"> · </span>
                {countLabel(a.count)}
              </span>
            </span>
            {/* Mobile: Saiu before Entrou, as the tiles. */}
            <span className="type-small num order-2 text-right text-muted-foreground lg:order-none lg:text-right">
              Entrou{' '}
              <span
                className="text-foreground"
                data-testid="fv-account-in"
                data-cents={a.inflow12m}
              >
                {formatBRL(a.inflow12m)}
              </span>
            </span>
            <span className="type-small num order-1 text-muted-foreground lg:order-none lg:text-right">
              Saiu{' '}
              <span
                className="text-foreground"
                data-testid="fv-account-out"
                data-cents={a.outflow12m}
              >
                {formatBRL(a.outflow12m)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {internal.outflow > 0 || internal.inflow > 0 ? (
        <p className="type-small max-w-[68ch] text-muted-foreground" data-testid="fv-internal-note">
          {/* The larger side, so an account outside the analysis (only one leg seen) is still covered. */}
          <span className="num" data-cents={Math.max(internal.inflow, internal.outflow)}>
            {formatBRL(Math.max(internal.inflow, internal.outflow))}
          </span>{' '}
          {internal.inflow !== internal.outflow
            ? 'são transferências entre contas suas: contam em “Saiu” e em “Entrou”.'
            : holder === 'PJ'
              ? 'foram transferidos entre contas da própria empresa: saem de uma conta e entram em outra, por isso aparecem em “Saiu” e em “Entrou”.'
              : 'foram transferidos entre as suas contas: saem de uma conta e entram em outra, por isso aparecem em “Saiu” e em “Entrou”.'}
        </p>
      ) : null}
    </section>
  );
}

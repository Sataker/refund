import { formatYearMonth } from '@/lib/format';
import { ExclusionSwitch } from './exclusions.client.tsx';
import { HolderPanel } from './holder-panel.tsx';
import { HolderTabs } from './holder-tabs.client.tsx';
import type { FinanceScreenData } from './types.ts';

/** Screen 5b, "Para onde foi o dinheiro". Shared by /demo (build time) and /app (server component, E14 task 7). */
export function FinanceScreen({ data }: { data: FinanceScreenData }) {
  const { view } = data;
  const first = view.months[0];
  const last = view.months.at(-1);
  return (
    <div className="flex flex-col gap-6" data-testid="fv-screen">
      <header className="flex flex-col gap-1.5">
        <p className="type-small text-muted-foreground">Finanças · {data.title}</p>
        <h1 className="font-serif text-[40px] leading-[44px] font-normal tracking-[-0.01em] text-foreground lg:text-[52px] lg:leading-[56px]">
          Para onde foi o dinheiro
        </h1>
        {first === undefined || last === undefined ? null : (
          <p className="type-small text-muted-foreground">
            {formatYearMonth(first)} a {formatYearMonth(last)} · valores como saíram da conta
          </p>
        )}
      </header>
      {view.pj === null && view.pf === null ? (
        <FinanceEmpty dashboard={data.links.dashboard} />
      ) : (
        <ExclusionSwitch
          storage={data.storageKey}
          variants={Object.fromEntries(
            Object.entries(data.variants).map(([key, v]) => [
              key,
              <HolderTabs
                key={key}
                pj={
                  v.pj === null ? null : (
                    <HolderPanel data={data} holder={v.pj} excluded={v.excluded} />
                  )
                }
                pf={
                  v.pf === null ? null : (
                    <HolderPanel data={data} holder={v.pf} excluded={v.excluded} />
                  )
                }
              />,
            ]),
          )}
        />
      )}
    </div>
  );
}

export function FinanceEmpty({ dashboard }: { dashboard: string }) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-6"
      data-testid="fv-empty"
    >
      <p className="text-base text-foreground">Ainda não há lançamentos nesta análise.</p>
      <a
        href={dashboard}
        className="type-small font-medium text-cobalt underline-offset-4 hover:underline"
      >
        Ir para o painel
      </a>
    </div>
  );
}

/** Error state (Screen 5b microcopy): the findings stay on the dashboard. */
export function FinanceError({ dashboard, retry }: { dashboard: string; retry: string }) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-6"
      data-testid="fv-error"
    >
      <p className="text-base text-foreground">
        Não conseguimos montar suas finanças agora. Seus achados continuam no painel.
      </p>
      <div className="flex gap-4">
        <a
          href={retry}
          className="type-small font-medium text-cobalt underline-offset-4 hover:underline"
        >
          Tentar de novo
        </a>
        <a
          href={dashboard}
          className="type-small font-medium text-cobalt underline-offset-4 hover:underline"
        >
          Ir para o painel
        </a>
      </div>
    </div>
  );
}

/** Loading skeleton: 3 tiles + 6 rows (never a lone spinner). */
export function FinanceSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-label="Carregando finanças"
    >
      <div className="h-24 w-2/3 animate-pulse rounded-md bg-surface-2" />
      <div className="grid gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

import type { ApplicableRule, BoundaryScenario, Cents, ProfileEstimate } from '@refund/engine';
import { formatProfileRange, NO_RANGE_MESSAGES, rangeInThousands } from '@refund/engine';
import { Highlight } from '@/components/brand/highlight';
import { LawSeal } from '@/components/brand/law-seal';
import { formatRatePercent } from '@/lib/format';
import { rangeLead } from './range-sentence';

// Step `estimativa` (ENGINE-SPEC C.11.6–C.11.7, governing the Screen 1 wireframe): the rules that may
// apply with the why and the `§`, then the "estimativa por perfil" range, or the reason there is none.
// The web calculates nothing: it formats `total` (minimum down, maximum up, to the thousand) and puts
// the exact cents in data-cents-min/max. Never `gridTotal`, never the sum of the per-rule ranges.

const RULE_NAME: Record<ApplicableRule['ruleId'], string> = {
  R01: 'Fator R (pró-labore × Anexo III/V)',
  R05: 'Exportação de serviço',
  R06: 'Produtos monofásicos',
  R03: 'Limite de faturamento',
  R02: 'Dividendos acima de R$ 50 mil por mês',
};

/** Grid revenues are whole thousands of reais (C.11.2), so the integer division is exact. */
const thousands = (cents: number): string =>
  String((cents - (cents % 100_000)) / 100_000).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

function listPt(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

/** "Por que essa faixa?" sentence (C.11.7) from the scenarios the engine actually ran. */
function whySentence(scenarios: readonly BoundaryScenario[]): string {
  const revenues = [...new Set(scenarios.map((s) => s.monthlyRevenue))].sort((a, b) => a - b);
  const fractions = [...new Set(scenarios.map((s) => s.exportFraction))].sort();
  const payrolls = new Set(scenarios.map((s) => s.monthlyCltPayroll > 0)).size;
  const fractionText =
    fractions.length === 1 && fractions[0] === '0'
      ? 'sem receita do exterior'
      : `receita do exterior de ${listPt(fractions.map((f) => formatRatePercent(f, 0)))} do total`;
  const payrollText =
    payrolls > 1
      ? 'folha CLT de zero, logo abaixo e no limite dos 28% do faturamento'
      : 'sem folha CLT';
  return `Rodamos o mesmo motor da análise em ${scenarios.length} cenários-limite do seu perfil: faturamento de ${listPt(revenues.map((r) => `R$ ${thousands(r)} mil`))} por mês; ${fractionText}; ${payrollText}. A faixa vai do menor ao maior resultado, com o mínimo reduzido em 15% por segurança. Não é média de mercado.`;
}

function RuleList({ rules }: { rules: ApplicableRule[] }) {
  if (rules.length === 0) return null;
  return (
    <section aria-labelledby="rules-title" className="mb-8">
      <h2 id="rules-title" className="type-body-lg text-foreground">
        Pelo seu CNAE e pelo que a Receita mostra,{' '}
        <strong className="font-semibold">
          {rules.length === 1 ? '1 regra pode' : `${rules.length} regras podem`}
        </strong>{' '}
        se aplicar.
      </h2>
      <ul className="mt-4 flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
        {rules.map((r) => (
          <li key={r.ruleId} className="p-4" data-testid={`applicable-${r.ruleId}`}>
            <p className="type-small font-semibold text-foreground">{RULE_NAME[r.ruleId]}</p>
            <p className="type-small mt-1 text-muted-foreground">{r.why}</p>
            <LawSeal lawRef={r.ref} className="mt-3" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EstimateView({ estimate, cnae }: { estimate: ProfileEstimate; cnae: string }) {
  return (
    <div data-testid="estimate" data-type={estimate.type}>
      <RuleList rules={estimate.rules} />
      {estimate.type === 'range' ? (
        <section aria-labelledby="range-title">
          <span className="type-caption inline-flex rounded-full border border-border bg-surface px-3 py-1 text-muted-foreground">
            {estimate.label}
          </span>
          <p
            id="range-title"
            className="type-h2 mt-4 text-balance text-foreground"
            data-testid="profile-range"
            data-cents-min={estimate.total[0]}
            data-cents-max={estimate.total[1]}
          >
            {/* The highlight wraps line by line (variant text); the verb and each "R$" stay glued to what
                follows, so 390 px gets no clipped band and no orphan word (E12 UX review). */}
            {rangeLead(estimate.rules)}
            {'\u00a0'}
            <Highlight variant="text">
              <span className="num">
                {`${formatProfileRange(estimate.total)} por ano`.replaceAll('R$ ', 'R$\u00a0')}
              </span>
            </Highlight>{' '}
            a menos de imposto.
          </p>
          <p className="type-small mt-3 text-muted-foreground">
            O valor da sua empresa sai do extrato, no próximo passo.
          </p>
          <WhyRange estimate={estimate} />
        </section>
      ) : (
        <section
          className="rounded-lg border border-border bg-surface p-5"
          data-testid="no-range"
          data-reason={estimate.reason}
        >
          <span className="type-caption inline-flex rounded-full border border-border px-3 py-1 text-muted-foreground">
            {estimate.label}
          </span>
          <p className="type-body-lg mt-3 text-foreground">
            {NO_RANGE_MESSAGES[estimate.reason].replace('{cnae}', cnae)}
          </p>
          {estimate.scenarios.length > 0 ? <WhyRange estimate={estimate} noRange /> : null}
        </section>
      )}
    </div>
  );
}

function WhyRange({ estimate, noRange = false }: { estimate: ProfileEstimate; noRange?: boolean }) {
  const ranged = estimate.rules.filter((r) => r.range !== undefined);
  return (
    <details
      className="group mt-6 rounded-lg border border-border bg-surface"
      data-testid="why-range"
    >
      <summary className="type-small cursor-pointer list-none px-4 py-3 font-medium text-foreground marker:hidden">
        {noRange ? 'Por que não mostramos um número?' : 'Por que essa faixa?'}
      </summary>
      <div className="border-t border-border px-4 py-4">
        <p className="type-small text-muted-foreground">{whySentence(estimate.scenarios)}</p>
        {estimate.assumptions.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {estimate.assumptions.map((a) => (
              <li key={a.id} className="type-small">
                <span className="font-medium text-foreground">{a.text}</span>
                <span className="block text-muted-foreground">{a.why}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {ranged.length > 0 ? (
          <div className="mt-4">
            <ul className="flex flex-col gap-1">
              {ranged.map((r) =>
                r.range ? (
                  <li key={r.ruleId} className="type-small num text-foreground">
                    {RULE_NAME[r.ruleId]}: {formatRuleRange(r.range)}
                  </li>
                ) : null,
              )}
            </ul>
            <p className="type-caption mt-2 text-muted-foreground">
              Não somam: uma regra muda a base da outra.
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function formatRuleRange(range: readonly [Cents, Cents]): string {
  const [min, max] = rangeInThousands(range);
  return min === 0 ? `até R$ ${max} mil por ano` : `${formatProfileRange(range)} por ano`;
}

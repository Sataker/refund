import { ConfidenceBadge } from '@/components/brand/confidence-badge';
import { Disclaimer } from '@/components/brand/disclaimer';
import { LawSeal } from '@/components/brand/law-seal';
import { MoneyHero } from '@/components/brand/money-hero';
import { formatBRL, formatYearMonth } from '@/lib/format';
import { hero } from './hero-data';

/**
 * The dashboard as a sheet of the ledger (Screen 0 mockup): the real numbers of the hero persona, the two
 * findings that make the total and, apart, the recovery range, which is never added to it (ENGINE-SPEC F.4).
 */
export function HeroMockup() {
  return (
    <figure
      aria-label={`Exemplo: painel da ${hero.companyName}, persona sintética`}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-lg"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-5 py-3 sm:px-6">
        <span className="flex flex-col">
          <span className="type-small font-medium text-foreground">{hero.companyName}</span>
          <span className="type-caption text-muted-foreground">Exemplo · persona sintética</span>
        </span>
        <span className="type-caption font-mono whitespace-nowrap text-muted-foreground">
          Simples · CNAE {hero.cnae}
        </span>
      </figcaption>

      <div className="space-y-2 px-5 pt-6 pb-5 sm:px-6">
        <p className="type-small text-muted-foreground">Você pode pagar a menos, dentro da lei</p>
        <MoneyHero
          cents={hero.savings12m}
          size="lg"
          testId="landing/money-hero"
          srLabel="Você pode pagar a menos nos próximos 12 meses"
          subline={<span className="num">nos próximos 12 meses ({hero.horizon})</span>}
        />
        <p className="type-small pt-1 text-muted-foreground">
          e{' '}
          <span
            data-testid="landing/regime-total"
            data-cents={hero.annualRegime}
            className="num font-semibold text-found-ink"
          >
            {formatBRL(hero.annualRegime)}
          </span>{' '}
          por ano a partir de {formatYearMonth(hero.regimeFrom)}
        </p>
      </div>

      <ul className="border-t border-border">
        {hero.findings.map((f, i) => (
          <li
            key={f.ruleId}
            data-testid={`landing/finding-${f.ruleId}`}
            className="enter grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 border-b border-border px-5 py-4 sm:px-6"
            style={{ animationDelay: `${400 + i * 60}ms` }}
          >
            <p className="type-small font-medium text-foreground">{f.title}</p>
            <p
              data-cents={f.cents}
              className="num type-small text-right font-semibold whitespace-nowrap text-found-ink"
            >
              {formatBRL(f.cents)}
            </p>
            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <LawSeal lawRef={f.lawRef} />
              <ConfidenceBadge level={f.confidence} />
            </div>
          </li>
        ))}
      </ul>

      <div className="relative px-5 py-4 sm:px-6" data-testid="landing/recovery">
        <span
          aria-hidden="true"
          className="hatch absolute inset-y-0 left-0 w-1 text-conf-estimated"
        />
        <p className="type-small text-foreground">
          <span
            data-testid="landing/recovery-min"
            data-cents={hero.recoveryMin}
            className="num font-semibold"
          >
            {formatBRL(hero.recoveryMin)}
          </span>{' '}
          a{' '}
          <span
            data-testid="landing/recovery-max"
            data-cents={hero.recoveryMax}
            className="num font-semibold"
          >
            {formatBRL(hero.recoveryMax)}
          </span>{' '}
          pagos a mais, para recuperar.
        </p>
        <p className="type-caption mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <ConfidenceBadge level="estimated" />
          Fica fora da conta de cima.
        </p>
      </div>

      <div className="border-t border-border px-5 py-3 sm:px-6">
        <Disclaimer size="caption" />
      </div>
    </figure>
  );
}

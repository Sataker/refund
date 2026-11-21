import { ArrowRight, Check } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Highlight } from '@/components/brand/highlight';
import { formatBRLWhole, THIN_NBSP } from '@/lib/format';
import { cn } from '@/lib/utils';
import { perMonthOfYear, priceLabel, type RoiOfferTerms } from './model';
import { monthlyCents, roiMultiple } from './roi';

// D58 (PLAN §18, 21/11; IDENTITY-AND-UI Screen 10): the soft offer next to the money. It is plain presentation (no
// hook, no server import), so the server pages and Screen 4's client component render the same card. Every number
// arrives as integer cents; the ROI claim uses the estimate's minimum or the confirmed total, never the maximum, and
// disappears when the savings do not pay the plan once.

export interface RoiOfferProps {
  /** `estimate`: the range's minimum (Estimativa step). `confirmed`: the analysis's confirmed total. */
  variant: 'estimate' | 'confirmed';
  /** Integer cents; null or 0 = the card only offers the plan, with no ROI claim. */
  savingsCents: number | null;
  terms: RoiOfferTerms;
  /** The plans page (or the demo's) with the yearly Empresa preselected. */
  href: string;
  /** The free path ("Continuar grátis e ver o número exato"), where there is one. */
  secondary?: ReactNode;
  /** Bug bash 20/11 C1: on example statements the amount never reads as the company's own confirmed number. */
  example?: boolean;
  className?: string;
}

const BULLETS = [
  'O cálculo completo de cada achado: entradas, fórmula e artigo da lei',
  'Plano de ação com prazos, com a recuperação DAS a DAS',
  'Relatório completo para o seu contador',
] as const;

/** "R$ 12 mil" (floored to the thousand, like the range above it) or, under R$ 1.000, the whole reais. */
function estimateLabel(cents: number): string {
  const thousands = (cents - (cents % 100_000)) / 100_000;
  if (thousands === 0) return formatBRLWhole(cents);
  return `R$${THIN_NBSP}${thousands.toLocaleString('pt-BR')}\u00a0mil`;
}

const nb = (s: string): string => s.replaceAll('R$ ', 'R$ ');

export function RoiOffer({
  variant,
  savingsCents,
  terms,
  href,
  secondary,
  example = false,
  className,
}: RoiOfferProps) {
  const yearly = terms.price.yearlyCents;
  const savings = savingsCents !== null && savingsCents > 0 ? savingsCents : null;
  const multiple = roiMultiple(savings, yearly);
  const loss = savings === null ? 0 : monthlyCents(savings);
  const priceText = (
    <>
      O plano Empresa custa{' '}
      <strong className="num font-semibold" data-testid="roi-price" data-cents={yearly}>
        {nb(`${priceLabel(yearly)}/ano`)}
      </strong>{' '}
      <span className="num">({nb(`${priceLabel(perMonthOfYear(yearly))}/mês`)}).</span>
    </>
  );
  const amount =
    savings === null ? null : (
      <Highlight variant="text">
        <span className="num" data-testid="roi-savings" data-cents={savings}>
          {variant === 'estimate' ? `${estimateLabel(savings)}/ano` : formatBRLWhole(savings)}
        </span>
      </Highlight>
    );

  return (
    <section
      aria-label="Oferta do plano Empresa"
      data-testid="roi-offer"
      data-variant={variant}
      data-cents={savings ?? 0}
      data-multiple={multiple ?? ''}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-lg border border-strong-border bg-surface p-5 sm:p-6',
        className,
      )}
    >
      <p className="type-overline text-muted-foreground">Plano Empresa</p>
      <h2 className="type-body-lg text-balance text-foreground">
        {amount === null ? null : variant === 'estimate' ? (
          <>Sua estimativa: a partir de {amount}. </>
        ) : example ? (
          <>No extrato de exemplo: {amount} nos próximos 12 meses. </>
        ) : (
          <>{amount} confirmados nos próximos 12 meses. </>
        )}
        {priceText}
      </h2>
      {multiple !== null ? (
        <p
          className="type-body-lg text-foreground"
          data-testid="roi-multiple"
          data-value={multiple}
        >
          {variant === 'estimate'
            ? 'A economia mínima estimada paga o plano '
            : example
              ? 'Neste exemplo, a economia paga o plano '
              : 'A economia confirmada paga o plano '}
          <strong className="num font-semibold">
            {multiple === 1 ? '1 vez' : `${multiple.toLocaleString('pt-BR')} vezes`}
          </strong>
          .
        </p>
      ) : null}
      {loss > 0 ? (
        <p className="type-small text-muted-foreground" data-testid="roi-monthly-loss">
          Cada mês sem ajustar: cerca de{' '}
          <span className="num text-foreground" data-cents={loss}>
            {formatBRLWhole(loss)}
          </span>{' '}
          a mais de imposto.
        </p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {BULLETS.map((b) => (
          <li key={b} className="type-small flex items-start gap-2 text-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4">
        <Link
          href={href as Route}
          data-testid="roi-unlock"
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-center text-base font-medium text-primary-foreground sm:w-auto"
        >
          Desbloquear o plano Empresa
          <ArrowRight className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        </Link>
        {secondary}
      </div>
      <p className="type-caption text-muted-foreground" data-testid="roi-trust">
        Pix · acesso imediato · estimativa informativa, o contador valida. Garantia de{' '}
        {terms.guaranteeDays} dias: devolvemos o primeiro pagamento.
      </p>
    </section>
  );
}

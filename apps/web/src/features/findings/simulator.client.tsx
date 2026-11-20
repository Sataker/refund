'use client';

import { type EngineResult, type Facts, recalculate } from '@refund/engine';
import { useId, useState } from 'react';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MARGIN_STEPS, type ProLaborePoint, proLaborePoint } from './model';
import { type CurvePoint, OptimizerCurve } from './optimizer-curve';
import {
  formatMarginPp,
  lateStartText,
  type MarginStepValue,
  marginCostText,
  marginTradeoffText,
  perYearText,
} from './simulator-text';

// Screen 6 "SIMULE" (IDENTITY-AND-UI Screen 6; ARCHITECTURE §7.3; TESTS D8): the browser runs the SAME engine
// (`recalculate()` over the persona's Facts) when the slider moves the engine's own assumption, the safety margin of
// the Fator R (ENGINE-SPEC D.1, D13). The engine answers with the pró-labore, the curve and every value; at the
// default position the snapshot is shown untouched, so going back gives the exact original number.
// D32 (PLAN §18): the slider is a safety margin. The 12-month value stays the main figure; the margin's cost comes
// from the engine's per-year values of the steps (computed at build), the regime start from R01's regimeFrom.

interface SimulatorProps {
  facts: Facts;
  /** The default margin (D13 '0.01' for the hero) and the snapshot's numbers at it. */
  defaultMargin: string;
  base: ProLaborePoint;
  baseCurve: CurvePoint[];
  /** D48: the first optimizer candidate (minimum wage); points below it are display-only. */
  candidatesFrom?: number;
  /** R01's per-year value at every MARGIN_STEPS step (engine, at build). */
  steps: MarginStepValue[];
}

interface Point {
  point: ProLaborePoint;
  curve: CurvePoint[];
}

function run(facts: Facts, margin: string): Point | null {
  const r = recalculate(facts, {
    ...facts.assumptions,
    fatorRMargin: { value: margin, origin: 'user', editable: true, source: 'slider' },
  });
  if (!r.ok) return null;
  const point = proLaborePoint(r.value as EngineResult);
  // D48: the display curve (display-only points below the minimum wage) when the engine gives one.
  const curve = r.value.optimizerDisplayCurve ?? r.value.optimizerCurve ?? [];
  return point ? { point, curve } : null;
}

export default function Simulator({
  facts,
  defaultMargin,
  base,
  baseCurve,
  candidatesFrom,
  steps,
}: SimulatorProps) {
  const labelId = useId();
  const sliderId = useId();
  // L6: fails closed. A default margin outside the steps could never be given back exactly (D8).
  const defaultIndex = MARGIN_STEPS.indexOf(defaultMargin);
  const [index, setIndex] = useState(defaultIndex);
  const [state, setState] = useState<Point | null>({ point: base, curve: baseCurve });
  const margin = MARGIN_STEPS[index] ?? defaultMargin;
  const move = (next: number) => {
    setIndex(next);
    if (next === defaultIndex) {
      setState({ point: base, curve: baseCurve });
      return;
    }
    setState(run(facts, MARGIN_STEPS[next] ?? defaultMargin));
  };
  const point = state?.point ?? null;
  if (defaultIndex < 0) return null;
  const cost =
    (point ? marginTradeoffText(steps, margin, point.regimeFrom) : null) ??
    marginCostText(steps, index);
  const late = point ? lateStartText(point.regimeFrom, base.regimeFrom) : null;
  const perYear = point ? perYearText(point.annual, point.regimeFrom) : null;

  return (
    <section
      aria-labelledby={labelId}
      data-testid="simulator"
      data-margin={margin}
      className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm lg:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={labelId} className="type-h3 text-foreground">
          Simule o pró-labore
        </h2>
        <span className="type-small text-muted-foreground">
          calculado no seu navegador pelo mesmo motor
        </span>
      </div>

      {point === null ? (
        <p className="type-small text-muted-foreground" role="status">
          Com essa folga, o motor não recomenda mudar o pró-labore.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="type-small text-muted-foreground">Pró-labore mensal</span>
            <span
              className="type-money-md num text-foreground"
              data-testid="sim/pro-labore"
              data-cents={point.target}
            >
              {formatBRL(point.target)}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <label htmlFor={sliderId} className="type-small font-medium text-foreground">
                Folga de segurança acima de 28%
              </label>
              <span className="type-small text-muted-foreground" data-testid="sim/margin">
                <span className="num text-foreground">{formatMarginPp(margin)}</span>
                {index === defaultIndex ? ' (recomendada)' : ''}
              </span>
            </div>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={MARGIN_STEPS.length - 1}
              step={1}
              value={index}
              onChange={(e) => move(Number(e.target.value))}
              aria-valuetext={`folga de ${formatMarginPp(margin)}, pró-labore de ${formatBRL(point.target)} por mês`}
              data-testid="sim/slider"
              className="h-7 w-full cursor-pointer accent-[var(--accent-c)]"
            />
            <p className="type-small text-muted-foreground" data-testid="sim/help">
              Arraste para mudar a folga acima de 28% (0 a 5 p.p.); o pró-labore acompanha.
            </p>
            {cost ? (
              <p className="type-small num text-foreground" data-testid="sim/cost">
                {cost}
              </p>
            ) : null}
            {late ? (
              <p
                className="type-small font-medium text-warning"
                data-testid="sim/late"
                role="status"
              >
                {late}
              </p>
            ) : null}
            <p className="type-small text-muted-foreground">
              hoje <span className="num text-foreground">{formatBRL(point.current)}</span>
            </p>
          </div>
          <OptimizerCurve
            points={state?.curve ?? []}
            current={point.current}
            target={point.target}
            recommended={base.target}
            {...(candidatesFrom !== undefined ? { candidatesFrom } : {})}
          />
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="type-small text-muted-foreground">
                {point.value < 0 ? 'Nesse ponto' : 'Nos próximos 12 meses'}
              </dt>
              <dd
                className={cn(
                  'type-money-md num',
                  point.value < 0 ? 'text-risk' : 'text-found-ink',
                )}
                data-testid="sim/value"
                data-cents={point.value}
              >
                {point.value < 0
                  ? `Custa ${formatBRL(-point.value)} a mais nos próximos 12 meses`
                  : formatBRL(point.value)}
              </dd>
              {perYear ? (
                <dd
                  className="type-small num text-muted-foreground"
                  data-testid="sim/annual"
                  data-cents={point.annual ?? undefined}
                >
                  {perYear}
                </dd>
              ) : null}
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="type-small text-muted-foreground">
                Total com essa folga (simulação; o painel não muda)
              </dt>
              <dd
                className="type-money-md num text-foreground"
                data-testid="sim/total"
                data-cents={point.total}
              >
                {formatBRL(point.total)}
              </dd>
            </div>
          </dl>
          {index !== defaultIndex ? (
            <button
              type="button"
              onClick={() => move(defaultIndex)}
              data-testid="sim/reset"
              className="type-small self-start font-medium text-cobalt underline-offset-4 hover:underline"
            >
              Voltar ao recomendado
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

'use client';

import { BellRing, FlaskConical } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { Highlight } from '@/components/brand/highlight';
import { LawSeal } from '@/components/brand/law-seal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { LawAlertModel } from './alert-model.ts';

// Screen 9 "A lei mudou" on /demo (IDENTITY-AND-UI Screen 9; ARCHITECTURE §2.6 Demo box). Before the click: the
// empty state. "Simular publicação" reveals the cycle the webhook runs in production: the diff (removed in --risk with
// strikethrough, added on the amber highlight), the provisions it touches, the rules that read them and, when a
// scenario is defined, the engine's recalculation. Everything is labelled "simulação" (ADR-013).

const dayMonth = (civil: string): string => `${civil.slice(8, 10)}/${civil.slice(5, 7)}`;

export function LawAlert({ model, persona }: { model: LawAlertModel; persona: string }) {
  const [published, setPublished] = useState(false);
  const yours = model.rules.filter((r) => r.yours);

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="alertas-monitor"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-5 py-5"
      >
        <h2 id="alertas-monitor" className="type-body-lg font-semibold text-foreground">
          Monitor de leis
        </h2>
        {published ? null : (
          <p data-testid="law/empty" className="type-body text-muted-foreground">
            Nenhuma mudança na lei que afete você desde {dayMonth(model.since)}. Estamos monitorando{' '}
            {model.monitoredCount} normas.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPublished(true)}
            disabled={published}
            data-testid="law/simulate"
          >
            <FlaskConical strokeWidth={1.5} aria-hidden="true" />
            Simular publicação
          </Button>
          <span className="type-caption text-muted-foreground">
            Mostra o que acontece quando uma norma que usamos muda. É uma simulação.
          </span>
        </div>
      </section>

      {published ? (
        <Card
          data-testid="law/alert"
          aria-live="polite"
          className="gap-5 rounded-lg border border-border px-5 py-5 shadow-sm ring-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="law/simulation-label"
              className="type-caption inline-flex items-center gap-1.5 rounded-full border border-cobalt/40 bg-surface px-2.5 py-0.5 font-medium text-cobalt"
            >
              <BellRing className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              Simulação
            </span>
            <a
              href={model.regulationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="type-caption text-muted-foreground underline underline-offset-4"
            >
              {model.regulationLabel}
            </a>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="type-h3 font-semibold text-foreground">
              O texto de {model.regulationLabel} mudou.
            </h2>
            <p data-testid="law/summary" className="type-body text-foreground">
              {model.summary}
            </p>
          </div>

          <div
            data-testid="law/diff"
            className="flex flex-col gap-2 rounded-md border border-border bg-background px-4 py-3"
          >
            {model.lines.map((l, i) =>
              l.kind === 'removed' ? (
                <p
                  // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are static and ordered
                  key={i}
                  data-diff="removed"
                  className="type-small text-risk line-through decoration-risk/70"
                >
                  <span className="sr-only">Texto removido: </span>
                  {l.text}
                </p>
              ) : (
                <p
                  // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are static and ordered
                  key={i}
                  data-diff="added"
                  className="type-small text-foreground"
                >
                  <span className="sr-only">Texto novo: </span>
                  <Highlight variant="text">{l.text}</Highlight>
                </p>
              ),
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="type-small font-semibold text-foreground">Dispositivos alterados</h3>
            <ul className="flex flex-wrap gap-2">
              {model.articles.map((a) => (
                <li key={a.id} className="max-w-full">
                  <LawSeal lawRef={{ label: a.label, url: a.url }} />
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="type-small font-semibold text-foreground">
              Regras do Refund que usam esses dispositivos
            </h3>
            <ul className="flex flex-col gap-1.5">
              {model.rules.map((r) => (
                <li
                  key={r.ruleId}
                  data-testid={`law/rule-${r.ruleId}`}
                  data-affected="true"
                  data-yours={r.yours ? 'true' : 'false'}
                  className={cn(
                    'type-small flex flex-wrap items-center gap-2 rounded-md border px-3 py-2',
                    r.yours ? 'border-cobalt/50 bg-surface-2' : 'border-border',
                  )}
                >
                  <span className="font-mono text-[12px] text-muted-foreground">{r.ruleId}</span>
                  <span className="font-medium text-foreground">{r.name}</span>
                  <span className="text-muted-foreground">
                    {r.yours ? '· você tem um achado desta regra' : '· nenhum achado seu'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Impact model={model} persona={persona} yoursCount={yours.length} />

          <p className="type-caption text-muted-foreground">
            Simulação: o Refund nunca muda um número sozinho. Uma pessoa confere a mudança, e a nova
            regra entra como uma versão nova do motor, com os testes refeitos.
            {model.fixtureNote ? ` ${model.fixtureNote}` : null}
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Impact({
  model,
  persona,
  yoursCount,
}: {
  model: LawAlertModel;
  persona: string;
  yoursCount: number;
}) {
  const delta = model.delta;
  if (delta !== null) {
    const changed = delta.findings.filter((f) => f.beforeCents !== f.afterCents);
    const first = delta.findings[0];
    return (
      <div data-testid="law/impact" className="flex flex-col gap-2">
        <p className="type-body text-foreground">
          Impacto:{' '}
          {changed.length === 1 ? '1 achado recalculado' : `${changed.length} achados recalculados`}{' '}
          <span data-testid="law/delta-before" data-cents={delta.totalBeforeCents}>
            {formatBRL(delta.totalBeforeCents)}
          </span>{' '}
          →{' '}
          <Highlight animate={false}>
            <span data-testid="law/delta-after" data-cents={delta.totalAfterCents}>
              {formatBRL(delta.totalAfterCents)}
            </span>
          </Highlight>{' '}
          <span className="text-muted-foreground">(simulação)</span>
        </p>
        {first ? (
          <Link
            href={`/demo/${persona}/achados/${first.ruleId}` as Route}
            className="type-small font-medium text-cobalt underline underline-offset-4"
          >
            Ver achado
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <p data-testid="law/impact" className="type-body text-foreground">
      {yoursCount === 0
        ? 'Impacto: nenhum achado seu usa esses dispositivos. Nada a recalcular.'
        : `Impacto: ${yoursCount === 1 ? '1 achado seu foi marcado' : `${yoursCount} achados seus foram marcados`} para revisão.`}
    </p>
  );
}

'use client';

import { Check, Loader2, MessageSquareWarning } from 'lucide-react';
import { useState, useTransition } from 'react';
import { LawSeal } from '@/components/brand/law-seal';
import { Button } from '@/components/ui/button';

// /r/[token]: the accountant approves the report or asks for adjustments (ARCHITECTURE §4.7 decideReport). One final
// decision per report; the owner's screen follows it through the status SSE.

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
type Decision = 'approved' | 'adjustment';

/** One finding as the accountant reviews it: the same row as the /demo accountant view (amount and § chip). */
export interface ReviewItem {
  id: string;
  title: string;
  /** Already formatted on the server from the engine's value ("R$ 28.316,52 nos próximos 12 meses"). */
  value: string;
  /** The finding's first LegalRef (rule metadata). */
  lawRef?: { label: string; url: string };
  /** Alerts and risks: for reading, outside the total; nothing to approve. */
  readOnly?: boolean;
}

export function AccountantDecision({
  findings,
  decide,
  decided,
}: {
  findings: ReviewItem[];
  decide: (input: {
    decisions: { findingId: string; decision: Decision; comment?: string }[];
    final: 'approved' | 'adjustments';
  }) => Promise<Result<void>>;
  decided: 'approved' | 'adjustments' | null;
}) {
  const [byFinding, setByFinding] = useState<Record<string, Decision>>({});
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(decided);
  const [error, setError] = useState<string | null>(null);
  const [pending, begin] = useTransition();

  if (done)
    return (
      <p
        role="status"
        data-testid="accountant-done"
        data-decision={done}
        className="type-small inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-3 font-medium text-foreground print:hidden"
      >
        <Check className="size-4 text-success" aria-hidden="true" />
        {done === 'approved'
          ? 'Relatório aprovado. O cliente já vê.'
          : 'Ajustes pedidos. O cliente já vê.'}
      </p>
    );

  const submit = (final: 'approved' | 'adjustments') =>
    begin(async () => {
      setError(null);
      const decisions = findings
        .filter((f) => !f.readOnly)
        .map((f) => ({
          findingId: f.id,
          decision: byFinding[f.id] ?? (final === 'approved' ? 'approved' : 'adjustment'),
          ...(comment.trim() ? { comment: comment.trim().slice(0, 500) } : {}),
        }));
      const r = await decide({ decisions, final });
      if (r.ok) setDone(final);
      else setError(r.error.message);
    });

  return (
    <section
      aria-labelledby="decisao-titulo"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 print:hidden"
      data-testid="accountant-decision"
    >
      <h2 id="decisao-titulo" className="type-h4 text-foreground">
        Sua revisão
      </h2>
      <ul className="flex flex-col gap-3">
        {findings
          .filter((f) => !f.readOnly)
          .map((f) => {
            const d = byFinding[f.id];
            return (
              <li
                key={f.id}
                data-testid={`review-${f.id}`}
                data-decision={d ?? 'pending'}
                className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-base font-medium text-foreground">{f.title}</span>
                  <span className="type-small num text-muted-foreground">{f.value}</span>
                  {f.lawRef ? <LawSeal lawRef={f.lawRef} /> : null}
                </span>
                <span className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant={d === 'approved' ? 'default' : 'outline'}
                    aria-pressed={d === 'approved'}
                    onClick={() => setByFinding((x) => ({ ...x, [f.id]: 'approved' }))}
                  >
                    <Check className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    {d === 'approved' ? 'Aprovado' : 'Aprovar'}
                  </Button>
                  <Button
                    type="button"
                    variant={d === 'adjustment' ? 'secondary' : 'ghost'}
                    aria-pressed={d === 'adjustment'}
                    onClick={() => setByFinding((x) => ({ ...x, [f.id]: 'adjustment' }))}
                  >
                    <MessageSquareWarning className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    Pedir ajuste
                  </Button>
                </span>
              </li>
            );
          })}
      </ul>
      {findings.some((f) => f.readOnly) ? (
        <div className="flex flex-col gap-2">
          <h3 className="type-small font-medium text-muted-foreground">
            Riscos e alertas · fora do total (só leitura)
          </h3>
          <ul className="flex flex-col gap-2">
            {findings
              .filter((f) => f.readOnly)
              .map((f) => (
                <li
                  key={f.id}
                  data-testid={`review-${f.id}`}
                  className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 p-4"
                >
                  <span className="text-base text-foreground">{f.title}</span>
                  <span className="type-small num text-muted-foreground">{f.value}</span>
                  {f.lawRef ? <LawSeal lawRef={f.lawRef} className="mt-1" /> : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="type-small font-medium text-foreground">Comentário (opcional)</span>
        <textarea
          value={comment}
          maxLength={500}
          onChange={(e) => setComment(e.target.value)}
          className="min-h-20 rounded-md border border-border bg-background p-3 text-base"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          data-testid="approve-report"
          onClick={() => submit('approved')}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Aprovar relatório
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => submit('adjustments')}
        >
          Pedir ajustes
        </Button>
      </div>
      {error ? (
        <p role="alert" className="type-small text-risk">
          {error}
        </p>
      ) : null}
    </section>
  );
}

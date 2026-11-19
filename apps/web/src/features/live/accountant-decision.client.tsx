'use client';

import { Check, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

// /r/[token]: the accountant approves the report or asks for adjustments (ARCHITECTURE §4.7 decideReport). One final
// decision per report; the owner's screen follows it through the status SSE.

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };
type Decision = 'approved' | 'adjustment';

export function AccountantDecision({
  findings,
  decide,
  decided,
}: {
  findings: { id: string; title: string }[];
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
      const decisions = findings.map((f) => ({
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
      <ul className="flex flex-col gap-2">
        {findings.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="type-small text-foreground">{f.title}</span>
            <span className="flex gap-1">
              {(['approved', 'adjustment'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={byFinding[f.id] === d}
                  onClick={() => setByFinding((x) => ({ ...x, [f.id]: d }))}
                  className="type-caption min-h-9 rounded-md border border-border px-2.5 font-medium aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {d === 'approved' ? 'Aprovo' : 'Ajustar'}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
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
          Aprovar o relatório
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

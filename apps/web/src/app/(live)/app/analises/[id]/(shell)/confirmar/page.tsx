import { listAnalysisLedger } from '@refund/db';
import type { Metadata } from 'next';
import { answerCard, reanalyze } from '@/app/(live)/app/analises/actions';
import { confirmCards, distinguishCards, exampleCardText } from '@/features/findings/confirm';
import { StartAnalysisButton } from '@/features/live/buttons.client';
import { LiveConfirm } from '@/features/live/confirm.client';
import { isExampleBank } from '@/features/live/data-origin';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { questionsOf } from '@/server/analysis/actions.ts';
import { idMap, loadAnswers } from '@/server/analysis/input.ts';
import { shellPage } from '@/server/analysis/page.ts';

// Screen 7 in /app (ARCHITECTURE §13 `/app/analises/[id]/confirmar`): the analysis's own cards with the user's saved
// answers. A sample transaction per card comes from the stored ledger (masked description, already whitelisted).

export const metadata: Metadata = { title: 'Confirmar · Refund', robots: { index: false } };

export default async function LiveConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await shellPage(id);
  if (page.kind === 'off') return <LiveUnavailable message={page.message} />;
  const { ctx, live } = page;
  const [questions, answers, ledger] = await Promise.all([
    questionsOf(ctx.db, id),
    loadAnswers(ctx.db, ctx.userId, live.analysis.companyId),
    listAnalysisLedger(ctx.db, id),
  ]);
  const ids = idMap(ledger.map((r) => r.transaction));
  const byRowId = new Map(ledger.map((r) => [r.transaction.id, r.transaction]));
  const example = isExampleBank(live.origin);
  const asked = confirmCards(
    questions,
    answers,
    (txIds) => {
      const first = txIds.map((t) => byRowId.get(ids.get(t) ?? '')).find((t) => t !== undefined);
      return first
        ? {
            date: first.date,
            label:
              first.counterpartyDocType === 'CPF'
                ? `Pessoa física · ${first.counterpartyMask ?? ''}`
                : first.description,
            amountCents: Math.abs(first.amountCents),
            mask: first.counterpartyMask,
          }
        : null;
    },
    { payrollReport: live.origin.bank === 'sample' },
  );
  const cards = distinguishCards(asked).map((c) =>
    example ? { ...c, text: exampleCardText(c.text) } : c,
  );
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-serif text-[36px] leading-[40px] font-normal text-foreground lg:text-[44px] lg:leading-[48px]">
          Confirmar
        </h1>
        <p className="max-w-[64ch] text-base text-muted-foreground">
          {example
            ? 'Estas são as perguntas que a análise fez sobre as transações do extrato de exemplo. Responda para ver como as respostas mudam a conta; o motor refaz a conta e seu contador valida.'
            : 'Estas são as perguntas que a análise fez sobre as suas transações. Responda o que souber; o motor refaz a conta com as respostas e seu contador valida.'}
        </p>
      </header>
      <LiveConfirm
        cards={cards}
        answer={answerCard.bind(null, id)}
        redo={
          <StartAnalysisButton
            start={reanalyze.bind(null, { analysisId: id })}
            label="Refazer a análise com as respostas"
            testId="reanalyze-confirm"
          />
        }
      />
    </div>
  );
}

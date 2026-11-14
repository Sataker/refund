'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';

export type TxAnswer = 'yes' | 'no' | 'dont_know';

interface TxConfirmCardProps {
  amountCents: number;
  /** CivilDate "2026-07-10". */
  date: string;
  /** Already masked by the whitelist (CLAUDE.md rule 4). */
  counterparty: string;
  question: string;
  onAnswer: (answer: TxAnswer) => void;
  testId?: string;
  className?: string;
}

function formatCivilDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** One transaction, one question, three answers (IDENTITY-AND-UI §4.8; Screen 7). */
export function TxConfirmCard({
  amountCents,
  date,
  counterparty,
  question,
  onAnswer,
  testId = 'tx-confirm-card',
  className,
}: TxConfirmCardProps) {
  return (
    <Card
      data-testid={testId}
      className={cn('gap-5 rounded-lg border border-border px-6 py-6 shadow-sm ring-0', className)}
    >
      <div className="space-y-1">
        <p data-cents={amountCents} className="type-money-lg text-foreground">
          {formatBRL(amountCents)}
        </p>
        <p className="type-small num text-muted-foreground">
          {formatCivilDate(date)} · {counterparty}
        </p>
      </div>
      <p className="type-body-lg text-foreground">{question}</p>
      <div className="grid grid-cols-3 gap-2">
        <Button size="lg" onClick={() => onAnswer('yes')}>
          Sim
        </Button>
        <Button size="lg" variant="outline" onClick={() => onAnswer('no')}>
          Não
        </Button>
        <Button size="lg" variant="ghost" onClick={() => onAnswer('dont_know')}>
          Não sei
        </Button>
      </div>
    </Card>
  );
}

'use client';

import { BookmarkCheck, BookmarkPlus, Check, Copy, Send } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { demoSession, updatePersonaState } from '@/demo/demo-session';

// Screen 6 / 6b actions on /demo: everything stays in the browser (demo-session.ts); no e-mail on /demo.

function useMarked(persona: string, ruleId: string): [boolean, (on: boolean) => void] {
  const [marked, setMarked] = useState(false);
  useEffect(() => {
    setMarked(demoSession().personas[persona]?.marked?.includes(ruleId) ?? false);
  }, [persona, ruleId]);
  const set = (on: boolean) => {
    const current = demoSession().personas[persona]?.marked ?? [];
    const next = on ? [...new Set([...current, ruleId])] : current.filter((r) => r !== ruleId);
    updatePersonaState(persona, { marked: next });
    setMarked(on);
  };
  return [marked, set];
}

export function MarkForAccountant({ persona, ruleId }: { persona: string; ruleId: string }) {
  const [marked, setMarked] = useMarked(persona, ruleId);
  return (
    <Button
      type="button"
      variant={marked ? 'secondary' : 'default'}
      size="lg"
      aria-pressed={marked}
      data-testid="mark-for-accountant"
      onClick={() => setMarked(!marked)}
    >
      {marked ? (
        <BookmarkCheck className="size-4" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <BookmarkPlus className="size-4" strokeWidth={1.5} aria-hidden="true" />
      )}
      {marked ? 'Marcado para o contador' : 'Marcar para o contador'}
    </Button>
  );
}

/** "Enviar este passo a passo ao contador" (marks it and opens the report) and "Copiar" (plain text of the steps). */
export function PlanActions({
  persona,
  ruleId,
  text,
}: {
  persona: string;
  ruleId: string;
  /** The plan as plain text, built on the server from the engine's steps. */
  text: string;
}) {
  const router = useRouter();
  const [, setMarked] = useMarked(persona, ruleId);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button
        type="button"
        size="lg"
        onClick={() => {
          setMarked(true);
          router.push(`/demo/${persona}/relatorio` as Route);
        }}
      >
        <Send className="size-4" strokeWidth={1.5} aria-hidden="true" />
        Enviar este passo a passo ao contador
      </Button>
      <Button
        type="button"
        size="lg"
        variant="outline"
        data-testid="copy-plan"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? (
          <Check className="size-4" strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <Copy className="size-4" strokeWidth={1.5} aria-hidden="true" />
        )}
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  );
}

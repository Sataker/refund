'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { demoSession, onDemoMessage, updatePersonaState } from '@/demo/demo-session';
import { type ConfirmCard, isPersonaDefault } from './confirm';
import type { DashboardModel } from './model';

// The visitor's Screen 7 answers on /demo, shared by the dashboard and the confirm screen. They live in the browser
// (demo-session.ts); a change different from the persona's own answers asks /api/demo/recalcular, which runs the
// real pipeline. Back to the persona's answers = the build-time snapshot, to the cent.

export type RecalcStatus = 'idle' | 'loading' | 'error';

interface Recalculated {
  dashboard: DashboardModel;
  open: number;
}

export interface VisitorAnswers {
  ready: boolean;
  choices: Record<string, string>;
  reviewed: string[];
  model: DashboardModel;
  /** Cards still open for the engine ("Não sei"). */
  open: number;
  custom: boolean;
  status: RecalcStatus;
  choose: (cardId: string, value: string) => void;
  retry: () => void;
}

export function useVisitorAnswers(
  persona: string,
  cards: readonly ConfirmCard[],
  base: DashboardModel,
): VisitorAnswers {
  const [ready, setReady] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [result, setResult] = useState<Recalculated | null>(null);
  const [status, setStatus] = useState<RecalcStatus>('idle');
  const request = useRef(0);
  const custom = !isPersonaDefault(cards, choices);

  const load = useCallback(() => {
    const s = demoSession().personas[persona];
    setChoices(s?.choices ?? {});
    setReviewed(s?.reviewed ?? []);
    setReady(true);
  }, [persona]);

  useEffect(() => {
    load();
    return onDemoMessage(load);
  }, [load]);

  const recalc = useCallback(
    async (next: Record<string, string>) => {
      const id = ++request.current;
      if (isPersonaDefault(cards, next)) {
        setResult(null);
        setStatus('idle');
        return;
      }
      setStatus('loading');
      try {
        const res = await fetch('/api/demo/recalcular', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persona, choices: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const value = (await res.json()) as Recalculated;
        if (id !== request.current) return; // a newer answer already went out
        setResult(value);
        setStatus('idle');
      } catch {
        if (id === request.current) setStatus('error');
      }
    },
    [cards, persona],
  );

  // Every change of choices (including another tab's) brings the numbers in line.
  useEffect(() => {
    if (ready) void recalc(choices);
  }, [ready, choices, recalc]);

  const choose = useCallback(
    (cardId: string, value: string) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      const nextChoices = { ...choices };
      if (value === card.personaChoice) delete nextChoices[cardId];
      else nextChoices[cardId] = value;
      const nextReviewed = reviewed.includes(cardId) ? reviewed : [...reviewed, cardId];
      setChoices(nextChoices);
      setReviewed(nextReviewed);
      updatePersonaState(persona, { choices: nextChoices, reviewed: nextReviewed });
    },
    [cards, choices, reviewed, persona],
  );

  return {
    ready,
    choices,
    reviewed,
    model: custom && result ? result.dashboard : base,
    open: custom && result ? result.open : 0,
    custom,
    status: custom && result === null && status === 'idle' ? 'loading' : status,
    choose,
    retry: () => void recalc(choices),
  };
}

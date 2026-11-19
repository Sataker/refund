'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// "Apagar meus dados" (ARCHITECTURE §4.7 deleteMyData; §9.6). The word APAGAR is the confirmation; after it the
// session is gone and the action redirects to /dados-apagados (outside /app: no new session).

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export function DeleteData({
  remove,
}: {
  remove: (input: { confirmation: string }) => Promise<Result<{ pendingAtPluggy: number }>>;
}) {
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, begin] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        begin(async () => {
          setError(null);
          const r = await remove({ confirmation: word.trim() });
          // On success the action redirects to /dados-apagados (the session is gone).
          if (!r.ok) setError(r.error.message);
        });
      }}
    >
      <label htmlFor="delete-confirmation" className="flex flex-col gap-1">
        <span className="type-small font-medium text-foreground">Digite APAGAR para confirmar</span>
        <Input
          id="delete-confirmation"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          autoComplete="off"
          data-testid="delete-confirmation"
          className="w-48"
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        disabled={pending || word.trim() !== 'APAGAR'}
        data-testid="delete-my-data"
        className="self-start border-risk text-risk"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
        )}
        Apagar meus dados
      </Button>
      {error ? (
        <p role="alert" className="type-small text-risk">
          {error}
        </p>
      ) : null}
    </form>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ClientResult } from '@/features/track/client-types';

/**
 * "Desconectar" on the end-of-track screen (compliance review E11, C2): as easy to withdraw as to give.
 * The server deletes the copied statement and, with the last account, the consent; the page then leads
 * back to the step that needs the account again.
 */
export function DisconnectButton({
  revoke,
  label,
}: {
  revoke: () => Promise<ClientResult<void>>;
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-label={label}
        onClick={() =>
          start(async () => {
            const r = await revoke();
            if (r.ok) router.refresh();
            else setError(r.error.message);
          })
        }
        className="type-small text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
      >
        Desconectar
      </button>
      {error ? (
        <span className="type-caption text-risk" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

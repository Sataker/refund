'use client';

import { ArrowRight } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TrackAction } from './client-types';

interface AdvanceButtonProps {
  action: TrackAction;
  label: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  arrow?: boolean;
  testId?: string;
  className?: string;
}

/**
 * One action per screen (track simplicity rule 1): saves on the server, then goes where the server
 * says. The error stays on this screen, in human language, with the button to try again (rule 7).
 */
export function AdvanceButton({
  action,
  label,
  variant = 'default',
  arrow = true,
  testId,
  className,
}: AdvanceButtonProps) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    start(async () => {
      const r = await action();
      if (r.ok) router.push(r.value.next as Route);
      else setError(r.error.message);
    });
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button
        type="button"
        size={variant === 'link' || variant === 'ghost' ? 'lg' : 'xl'}
        variant={variant}
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        data-testid={testId}
        className={cn(variant === 'link' ? 'px-0' : 'w-full sm:w-auto')}
      >
        {label}
        {arrow ? <ArrowRight className="size-4" strokeWidth={1.5} aria-hidden="true" /> : null}
      </Button>
      <p aria-live="polite" className="type-small min-h-5 text-risk">
        {error}
      </p>
    </div>
  );
}

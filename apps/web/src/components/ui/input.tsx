import type * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Refund: --border-strong outline (≥ 3:1), --text-subtle placeholder, global --ring focus (§4.3).
        'h-10 w-full min-w-0 rounded-md border border-input bg-surface px-3 py-1 text-base text-foreground transition-colors duration-(--dur-fast) file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-subtle disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-risk',
        className,
      )}
      {...props}
    />
  );
}

export { Input };

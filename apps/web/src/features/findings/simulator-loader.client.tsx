'use client';

import dynamic from 'next/dynamic';

// The engine reaches the browser only on the R01 detail, in its own chunk (ARCHITECTURE §11.1 budget).
export const SimulatorLoader = dynamic(() => import('./simulator.client'), {
  loading: () => (
    <div
      aria-hidden="true"
      className="shimmer h-[520px] rounded-xl border border-border"
      data-testid="simulator-loading"
    />
  ),
});

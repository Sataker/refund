import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Live /app (ARCHITECTURE §13): per-session pages, never prerendered (the capabilities are read at
// request time; a page built without env must not be served once the env exists) and never indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Refund · primeiro acesso',
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { geist, geistMono, instrumentSerif } from '@/styles/fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Refund · imposto com a conta aberta',
  description:
    'Ache o dinheiro que o governo te deve. Com a conta aberta e o artigo da lei. Economia tributária lícita para PF e PJ.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F0EEE8' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0B0D' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      // theme-init.js sets .dark/.light before the first paint; React must not warn about it.
      suppressHydrationWarning
      className={cn(geist.variable, geistMono.variable, instrumentSerif.variable)}
    >
      <head>
        {/* Blocking on purpose: 400 bytes, same origin, avoids a light flash in dark mode. */}
        <script src="/theme-init.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}

import localFont from 'next/font/local';

// IDENTITY-AND-UI §4.5, self-hosted (ADR-014: CSP `font-src 'self'`, zero requests to Google at runtime
// or at build). Geist and Geist Mono come from the `geist` package (OFL 1.1, origin: vercel/geist-font);
// Instrument Serif is vendored from @fontsource/instrument-serif 5.3.0 (OFL 1.1, see OFL-instrument-serif.txt).

export const geist = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const geistMono = localFont({
  src: '../../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  // Below the fold (calculation, law, CNPJ): not worth competing with the LCP fonts.
  preload: false,
  adjustFontFallback: false,
});

export const instrumentSerif = localFont({
  src: [
    { path: './fonts/instrument-serif-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/instrument-serif-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  variable: '--font-instrument-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

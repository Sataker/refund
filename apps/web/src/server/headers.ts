// ARCHITECTURE §9.1. No 'server-only' here: next.config.ts reads this file at build time.

const isDev = process.env.NODE_ENV === 'development';

const CSP = [
  "default-src 'self'",
  // ADR-014: no nonce, to keep pages static. 'unsafe-eval' only in `next dev` (React Refresh needs it).
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://vitals.vercel-insights.com",
  'frame-src https://connect.pluggy.ai',
  "frame-ancestors 'none'",
  "form-action 'self' https://*.authkit.app https://api.workos.com",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

export const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

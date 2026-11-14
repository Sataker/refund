import { type NextRequest, NextResponse } from 'next/server';
import { serverSecrets } from '@/server/crypto.ts';
import {
  newSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  verifySession,
} from '@/server/session-cookie.ts';

// ARCHITECTURE §9.2 (ADR-008): mints the anonymous `rf_sid` on the first visit to /app/**. No database
// here (the row is created by the first server action) and no plan enforcement (§8.2). Without the
// session secret (backup deployment) it does nothing and /app shows "modo ao vivo não está ativo".
// WorkOS AuthKit joins here in E18 when the `login` capability exists.

export function proxy(request: NextRequest): NextResponse {
  const secrets = serverSecrets();
  if (!secrets) return NextResponse.next();
  if (verifySession(request.cookies.get(SESSION_COOKIE)?.value, secrets.session)) {
    return NextResponse.next();
  }
  const fresh = newSession(secrets.session);
  // Also on the request, so this very render already sees the session.
  request.cookies.set(SESSION_COOKIE, fresh.value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(SESSION_COOKIE, fresh.value, SESSION_COOKIE_OPTIONS);
  return response;
}

export const config = {
  matcher: ['/app/:path*'],
};

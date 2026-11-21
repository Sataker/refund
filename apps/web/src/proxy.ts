import { authkit, handleAuthkitProxy, isAuthkitRequestHeader } from '@workos-inc/authkit-nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import { capabilities } from '@/server/capabilities.ts';
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
// D58: with the `login` capability, WorkOS AuthKit refreshes its own session cookie here too. Login never blocks a
// page (the gate is at checkout). An rf_sid signed for a WorkOS user (`wid`) lives only as long as that WorkOS
// session: once it expires or signs out, the browser gets a fresh anonymous rf_sid. On /auth/** only AuthKit runs, so
// the callback's re-signed rf_sid is the only one set there.

/** The pre-D58 proxy, unchanged: with login off, /app/** behaves exactly as before. */
function mintSession(request: NextRequest): NextResponse {
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

/** The request headers without any `x-workos-*` a client sent (AuthKit's own are set only by `authkit()`). */
function withoutAuthkitHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (isAuthkitRequestHeader(name)) headers.delete(name);
  return headers;
}

async function withLogin(request: NextRequest): Promise<NextResponse> {
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth');
  const secrets = isAuthRoute ? null : serverSecrets();
  const payload = secrets
    ? verifySession(request.cookies.get(SESSION_COOKIE)?.value, secrets.session)
    : null;

  let workosUserId: string | null = null;
  let headers: Headers | null = null;
  try {
    const result = await authkit(request);
    headers = result.headers;
    workosUserId = result.session.user?.id ?? null;
  } catch {
    // WorkOS unreachable or misconfigured: the anonymous app keeps working; no account session is honoured.
  }

  let minted: string | null = null;
  if (secrets && (!payload || (payload.wid !== undefined && payload.wid !== workosUserId))) {
    minted = newSession(secrets.session).value;
    request.cookies.set(SESSION_COOKIE, minted);
  }
  const response = headers
    ? handleAuthkitProxy(request, headers)
    : NextResponse.next({ request: { headers: withoutAuthkitHeaders(request) } });
  if (minted) response.cookies.set(SESSION_COOKIE, minted, SESSION_COOKIE_OPTIONS);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (capabilities().login) return withLogin(request);
  // The /auth routes answer by themselves with login off (they send back to /app); nothing to mint there.
  if (request.nextUrl.pathname.startsWith('/auth')) return NextResponse.next();
  return mintSession(request);
}

export const config = {
  matcher: ['/app/:path*', '/auth/:path*'],
};

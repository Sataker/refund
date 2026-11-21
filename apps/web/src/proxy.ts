import { authkit, handleAuthkitProxy } from '@workos-inc/authkit-nextjs';
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
// D58: with the `login` capability, WorkOS AuthKit refreshes its own session cookie here too (on /app/** and
// /auth/**), composed with the rf_sid minting. Login never blocks a page: the gate is at checkout only.

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

async function withLogin(request: NextRequest): Promise<NextResponse> {
  const secrets = serverSecrets();
  let minted: string | null = null;
  if (secrets && !verifySession(request.cookies.get(SESSION_COOKIE)?.value, secrets.session)) {
    minted = newSession(secrets.session).value;
    request.cookies.set(SESSION_COOKIE, minted);
  }
  let response: NextResponse;
  try {
    const { headers } = await authkit(request);
    response = handleAuthkitProxy(request, headers);
  } catch {
    // WorkOS unreachable or misconfigured: the anonymous app keeps working; checkout reports the sign-in error.
    response = NextResponse.next({ request: { headers: request.headers } });
  }
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

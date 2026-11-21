import { getWorkOS, withAuth } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { capabilities } from '@/server/capabilities.ts';
import { SESSION_COOKIE } from '@/server/session-cookie.ts';

// D58 (ARCHITECTURE §9.2): sign out of WorkOS and drop `rf_sid`, so the next visit starts a fresh anonymous session
// (the account and its plan stay on the server; signing in again finds them). POST only, from a same-site form
// (security review D58, item 3): a GET or a cross-site request changes nothing. Without a WorkOS session it still
// drops rf_sid and goes home (item 9).
export const dynamic = 'force-dynamic';

const WORKOS_COOKIE = process.env.WORKOS_COOKIE_NAME || 'wos-session';

function toApp(request: NextRequest): Response {
  return NextResponse.redirect(new URL('/app', request.url), 303);
}

export function GET(request: NextRequest): Response {
  return toApp(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!capabilities().login) return toApp(request);
  if (request.headers.get('sec-fetch-site') === 'cross-site') return toApp(request);
  let sessionId: string | undefined;
  try {
    sessionId = (await withAuth()).sessionId;
  } catch {
    // No AuthKit session header (or WorkOS unreachable): sign out locally only.
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(WORKOS_COOKIE);
  // 303: the browser follows with a GET (a 307 would re-POST to WorkOS).
  const target = sessionId
    ? getWorkOS().userManagement.getLogoutUrl({ sessionId })
    : new URL('/', request.url).toString();
  return NextResponse.redirect(target, 303);
}

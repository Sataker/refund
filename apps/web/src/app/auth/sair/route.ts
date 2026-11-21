import { signOut } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { capabilities } from '@/server/capabilities.ts';
import { SESSION_COOKIE } from '@/server/session-cookie.ts';

// D58 (ARCHITECTURE §9.2): sign out of WorkOS and drop `rf_sid`, so the next visit starts a fresh anonymous session
// (the account and its plan stay on the server; signing in again finds them). A plain link works; a cross-site
// request (logout CSRF) is ignored.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  if (!capabilities().login) return NextResponse.redirect(new URL('/app', request.url));
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.redirect(new URL('/app', request.url));
  }
  (await cookies()).delete(SESSION_COOKIE);
  // Redirects (to WorkOS's logout URL, then the sign-out redirect set in the dashboard): never returns.
  await signOut();
  return NextResponse.redirect(new URL('/', request.url));
}

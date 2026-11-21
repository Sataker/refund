import { type HandleAuthSuccessData, handleAuth } from '@workos-inc/authkit-nextjs';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { EMAIL_UNVERIFIED, linkWorkosUserWith } from '@/server/auth/link.ts';
import { DEFAULT_RETURN, safeReturnPath } from '@/server/auth/return-path.ts';
import { capabilities } from '@/server/capabilities.ts';
import { serverSecrets } from '@/server/crypto.ts';
import { getDb } from '@/server/db.ts';

// D58 (ARCHITECTURE §9.2): WorkOS sends the owner back here. AuthKit exchanges the code and sets its session cookie;
// onSuccess links the identity to the `rf_sid` user (or merges into the existing account and re-signs rf_sid). Any
// failure clears the WorkOS session and lands on the plans page with `?login=erro`, or `?login=confirme-email` when
// an unverified e-mail belongs to another account.
export const dynamic = 'force-dynamic';

async function onSuccess({ user }: HandleAuthSuccessData): Promise<void> {
  const secrets = serverSecrets();
  const handle = secrets ? await getDb() : null;
  if (!secrets || !handle) throw new Error('LIVE_OFF');
  const linked = await linkWorkosUserWith(user, { db: handle.db, secrets, jar: await cookies() });
  if (!linked.ok) throw new Error(linked.error.code);
}

function onError({ error, request }: { error?: unknown; request: NextRequest }): Response {
  const reason =
    error instanceof Error && error.message === EMAIL_UNVERIFIED ? 'confirme-email' : 'erro';
  return NextResponse.redirect(new URL(`${DEFAULT_RETURN}?login=${reason}`, request.url));
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!capabilities().login) return NextResponse.redirect(new URL('/app', request.url));
  const response = await handleAuth({ returnPathname: DEFAULT_RETURN, onSuccess, onError })(
    request,
  );
  // Belt and braces: the return path was validated before it was sealed; never redirect anywhere else.
  const location = response.headers.get('location');
  if (location) {
    const target = new URL(location, request.url);
    const sameOrigin = target.origin === new URL(request.url).origin;
    if (!sameOrigin || !safeReturnPath(`${target.pathname}${target.search}`)) {
      response.headers.set('location', new URL(DEFAULT_RETURN, request.url).toString());
    }
  }
  return response;
}

import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import { DEFAULT_RETURN, safeReturnPath } from '@/server/auth/return-path.ts';
import { capabilities } from '@/server/capabilities.ts';

// D58 (ARCHITECTURE §9.2): "Desbloquear" with no account → WorkOS AuthKit (Google or e-mail code). `voltar` is
// validated here and sealed by AuthKit into the PKCE state, so the callback can only return to a safe /app path.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  if (!capabilities().login) return NextResponse.redirect(new URL('/app', request.url));
  const returnTo = safeReturnPath(request.nextUrl.searchParams.get('voltar')) ?? DEFAULT_RETURN;
  const url = await getSignInUrl({ returnTo });
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

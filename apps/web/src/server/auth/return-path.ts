import 'server-only';

// D58: where a sign-in may send the owner back to. Only a relative path under /app (no scheme, no `//`, no `\`, no
// dot segments), so `voltar` can never become an open redirect. The query may carry the plan to open (`?assinar=`).

const SAFE_RETURN = /^\/app(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\/?(?:\?[A-Za-z0-9_.~=&%/-]*)?$/;
const MAX_LENGTH = 300;

export const DEFAULT_RETURN = '/app/plano';

export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_LENGTH) return null;
  return SAFE_RETURN.test(value) ? value : null;
}

/** The sign-in link handed to the client with `UNAUTHENTICATED` (ActionError.login). */
export function loginPath(returnTo: string): string {
  return `/auth/entrar?voltar=${encodeURIComponent(safeReturnPath(returnTo) ?? DEFAULT_RETURN)}`;
}

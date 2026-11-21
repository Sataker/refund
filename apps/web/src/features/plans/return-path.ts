import { parseCheckoutIntent } from './roi';

// Back to where the offer or the paywall was seen: only a path of this user's own /app (no open redirect). The
// estimate step joined the list with D58 (PLAN §18, 21/11), when the plans page opened right after the estimate.
export const RETURN_PATH =
  /^\/app(\/comecar\/estimativa|\/analises\/[0-9a-f-]{36}(\/(painel|financas|confirmar|relatorio|achados(\/[0-9a-f-]{36})?))?)$/;

export function safeReturnPath(value: unknown): string | null {
  return typeof value === 'string' && RETURN_PATH.test(value) ? value : null;
}

const BASE = 'https://refund.invalid';

/** Same-origin relative path, parsed; null for anything that could leave the site (`//host`, a scheme, a backslash). */
function relative(value: string): URL | null {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null;
  try {
    const url = new URL(value, BASE);
    return url.origin === BASE && url.hash === '' ? url : null;
  } catch {
    return null;
  }
}

/**
 * `/app/plano`, optionally with a valid `assinar` and a safe `voltar` and nothing else: where the sign-in may bring
 * the owner back to (D58).
 */
export function safePlansPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = relative(value);
  if (url?.pathname !== '/app/plano') return null;
  for (const [key, v] of url.searchParams) {
    if (key === 'assinar' && parseCheckoutIntent(v)) continue;
    if (key === 'voltar' && safeReturnPath(v)) continue;
    return null;
  }
  return value;
}

/**
 * D58: the sign-in path of an UNAUTHENTICATED checkout (`error.login`, from the auth PR): only `/auth/entrar` with a
 * `voltar` that is the plans page or a safe return path. Anything else is ignored (never an open redirect).
 */
export function loginPathOf(error: { code: string }): string | null {
  if (error.code !== 'UNAUTHENTICATED') return null;
  const login: unknown = (error as { login?: unknown }).login;
  if (typeof login !== 'string') return null;
  const url = relative(login);
  if (url?.pathname !== '/auth/entrar' || !login.startsWith('/auth/entrar?')) return null;
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== 'voltar') return null;
  const voltar = url.searchParams.get('voltar');
  return safePlansPath(voltar) || safeReturnPath(voltar) ? login : null;
}

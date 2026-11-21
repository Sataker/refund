// Back to where the offer or the paywall was seen: only a path of this user's own /app (no open redirect). The
// estimate step joined the list with D58 (PLAN §18, 21/11), when the plans page opened right after the estimate.
export const RETURN_PATH =
  /^\/app(\/comecar\/estimativa|\/analises\/[0-9a-f-]{36}(\/(painel|financas|confirmar|relatorio|achados(\/[0-9a-f-]{36})?))?)$/;

export function safeReturnPath(value: unknown): string | null {
  return typeof value === 'string' && RETURN_PATH.test(value) ? value : null;
}

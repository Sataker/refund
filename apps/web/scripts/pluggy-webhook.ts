// Creates (or lists) the GLOBAL Pluggy webhook with our secret header (ARCHITECTURE §4.9; ADR-010).
// Only `POST /webhooks` accepts custom headers; a `webhookUrl` on the connect token would not carry
// them. HTTPS only, no localhost (Pluggy refuses it). Calls the internet: never runs in CI.
//
// Usage (keys only in the shell or .env.local, never in Git):
//   PLUGGY_CLIENT_ID=… PLUGGY_CLIENT_SECRET=… PLUGGY_WEBHOOK_SECRET=… \
//     node apps/web/scripts/pluggy-webhook.ts --url=https://<domain>/api/webhooks/pluggy
//   … node apps/web/scripts/pluggy-webhook.ts --list
// Output: the webhook id, event and URL. Never the secret.

const API = 'https://api.pluggy.ai';
const SECRET_HEADER = 'x-refund-webhook-secret';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function call(path: string, init: RequestInit & { apiKey?: string } = {}): Promise<unknown> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.apiKey) headers['x-api-key'] = init.apiKey;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → HTTP ${res.status}`);
  return res.json();
}

async function main(): Promise<void> {
  const auth = (await call('/auth', {
    method: 'POST',
    body: JSON.stringify({
      clientId: need('PLUGGY_CLIENT_ID'),
      clientSecret: need('PLUGGY_CLIENT_SECRET'),
    }),
  })) as { apiKey?: string };
  const apiKey = auth.apiKey;
  if (!apiKey) throw new Error('no apiKey in the /auth response');

  if (process.argv.includes('--list')) {
    const list = (await call('/webhooks', { apiKey })) as {
      results?: { id: string; event: string; url: string }[];
    };
    for (const w of list.results ?? []) out(`${w.id}  ${w.event}  ${w.url}`);
    return;
  }

  const url = arg('url');
  if (!url?.startsWith('https://')) throw new Error('--url=https://… is required (no localhost)');
  const secret = need('PLUGGY_WEBHOOK_SECRET');
  if (secret.length < 32) throw new Error('PLUGGY_WEBHOOK_SECRET: use openssl rand -hex 32');
  const created = (await call('/webhooks', {
    method: 'POST',
    apiKey,
    body: JSON.stringify({ event: 'all', url, headers: { [SECRET_HEADER]: secret } }),
  })) as { id?: string; event?: string; url?: string };
  out(`created ${created.id ?? '?'}  ${created.event ?? 'all'}  ${created.url ?? url}`);
}

main().catch((err: unknown) => {
  process.stderr.write(`pluggy-webhook: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

// Server-side half of the zero-env proof (ARCHITECTURE §7.4, INFRA-CI §2.1 `demo-zero-env`). Preloaded into
// `next start` with `node --import`: every TCP connection the server opens to a host other than the loopback is
// refused and written to E2E_EGRESS_LOG, and the Playwright global teardown fails the run if that file is not empty.
// The browser half is the network guard in ../fixtures.ts. Covers fetch (undici), http, https and tls, which all
// end in `net.Socket#connect`.
import { appendFileSync, mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname } from 'node:path';

const LOG = process.env.E2E_EGRESS_LOG;
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\]|::ffff:127(?:\.\d{1,3}){3})$/i;

type ConnectArgs = Parameters<net.Socket['connect']>;

function target(args: unknown[]): { host: string; local: boolean } {
  const [first, second] = args;
  if (typeof first === 'object' && first !== null) {
    const o = first as { path?: unknown; host?: unknown };
    if (typeof o.path === 'string') return { host: `unix:${o.path}`, local: true };
    const host = typeof o.host === 'string' && o.host !== '' ? o.host : 'localhost';
    return { host, local: LOOPBACK.test(host) };
  }
  if (typeof first === 'string' && !/^\d+$/.test(first))
    return { host: `unix:${first}`, local: true };
  const host = typeof second === 'string' && second !== '' ? second : 'localhost';
  return { host, local: LOOPBACK.test(host) };
}

const original = net.Socket.prototype.connect;

net.Socket.prototype.connect = function guardedConnect(this: net.Socket, ...args: ConnectArgs) {
  const t = target(args);
  if (t.local) return original.apply(this, args);
  if (LOG) {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${new Date().toISOString()} ${t.host}\n`);
  }
  process.nextTick(() => this.destroy(new Error(`EXTERNAL_EGRESS_BLOCKED: ${t.host}`)));
  return this;
} as net.Socket['connect'];

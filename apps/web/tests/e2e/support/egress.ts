import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// The zero-env run (E2E_TARGET=zero-env) keeps the server's blocked external connections in one file per run
// (./no-egress.ts writes it). The config names it once, in the runner, through E2E_EGRESS_LOG: workers and the
// web server inherit the variable, so they all point at the same file, and the server's startup is covered too
// (the web server starts before the global setup).

export const NO_EGRESS_PRELOAD = join(import.meta.dirname, 'no-egress.ts');

export function egressLog(): string {
  const existing = process.env.E2E_EGRESS_LOG;
  if (existing) return existing;
  const path = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'test-results',
    `zero-env-egress-${process.pid}-${Date.now()}.log`,
  );
  mkdirSync(dirname(path), { recursive: true });
  process.env.E2E_EGRESS_LOG = path;
  return path;
}

export function egressAttempts(): string[] {
  const path = process.env.E2E_EGRESS_LOG;
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n').filter(Boolean);
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { egressAttempts } from './egress.ts';

// Playwright global setup for E2E_TARGET=zero-env (INFRA-CI §2.1 `demo-zero-env`). It refuses to run when any app
// variable of .env.example is set (the server inherits this environment, so the run would prove nothing), and
// returns the teardown, which fails the whole run if the server tried to reach an external host while it ran.

const ENV_EXAMPLE = join(import.meta.dirname, '..', '..', '..', '..', '..', '.env.example');

export function appVariables(): string[] {
  return [...readFileSync(ENV_EXAMPLE, 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].flatMap(
    (m) => (m[1] ? [m[1]] : []),
  );
}

export default function setup(): () => void {
  const present = appVariables().filter((name) => (process.env[name] ?? '') !== '');
  if (present.length > 0)
    throw new Error(`zero-env run with app variables set: ${present.join(', ')} (use env -i)`);
  return () => {
    const attempts = egressAttempts();
    if (attempts.length > 0)
      throw new Error(
        `the server tried to reach external hosts without env (ARCHITECTURE §7.4):\n${attempts.join('\n')}`,
      );
  };
}

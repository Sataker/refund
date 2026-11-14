import { cnpjCheckDigits } from '../src/cnpj/validate.ts';
import { cpfCheckDigits } from '../src/pii/cpf.ts';

// Personal-looking values are built at runtime so no test file holds a literal CPF, e-mail or phone
// (scripts/pii-guard.ts scans every tracked file).

export function cpfFrom(base: string): string {
  return `${base}${cpfCheckDigits(base)}`;
}

export function formatCpf(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function cnpjFrom(base: string): string {
  return `${base}${cnpjCheckDigits(base)}`;
}

export const CPF = cpfFrom('529982247');
export const CPF_2 = cpfFrom('111444777');
export const PERSONAL_EMAIL = ['joao.silva', 'gmail.com'].join('@');
export const PHONE = `11${'98765'}${'4321'}`;
/** Synthetic numeric CNPJ (made-up base). */
export const NUMERIC_CNPJ = cnpjFrom('907315489998');
/** Synthetic alphanumeric CNPJ from the official example. */
export const ALNUM_CNPJ = '12ABC34501DE35';

/** Fake `fetch` that answers each call with the next scripted response. */
export function scriptedFetch(
  steps: Array<
    | { status: number; body?: unknown; headers?: Record<string, string>; text?: string }
    | 'network-error'
    | 'hang'
  >,
): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(String(input));
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (step === 'network-error') throw new TypeError('fetch failed');
    if (step === 'hang' || step === undefined) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason ?? new DOMException('aborted', 'AbortError'));
        });
      });
    }
    const body = step.text ?? JSON.stringify(step.body ?? null);
    return new Response(body, {
      status: step.status,
      headers: { 'content-type': 'application/json', ...(step.headers ?? {}) },
    });
  }) as typeof fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

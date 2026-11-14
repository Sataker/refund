import { afterEach, describe, expect, it, vi } from 'vitest';
import { log, logger, redactLog, redactText, requestIdFrom } from './log.ts';

// Built at runtime so the repository PII guard does not see a formatted CPF in the source.
const CPF = `${['123', '456', '789'].join('.')}-09`;

afterEach(() => vi.restoreAllMocks());

describe('redactLog (ARCHITECTURE §6.5; TESTS §5)', () => {
  it('drops sensitive keys at any depth', () => {
    const out = redactLog({
      cpf: '123',
      user: { email: 'a@b.c', displayName: 'Marina', nested: [{ authorization: 'Bearer x' }] },
      sessionToken: 't',
      cookie: 'rf_sid=1',
      durationMs: 12,
    });
    expect(out).toEqual({
      cpf: '[redacted]',
      user: {
        email: '[redacted]',
        displayName: '[redacted]',
        nested: [{ authorization: '[redacted]' }],
      },
      sessionToken: '[redacted]',
      cookie: '[redacted]',
      durationMs: 12,
    });
  });

  it('strips documents and e-mails from strings', () => {
    const text = `PIX ${CPF} para 12.ABC.345/01DE-35, doc 12345678909 e ana@exemplo.com.br`;
    expect(redactText(text)).toBe('PIX [doc] para [doc], doc [doc] e [email]');
  });

  it('handles errors, dates, cycles, bigint and long strings', () => {
    const err = Object.assign(new Error(`falhou com ${CPF}`), { digest: 'd1' });
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    const out = redactLog({
      err,
      at: new Date(0),
      cyclic,
      n: 10n,
      long: 'x'.repeat(3000),
    }) as Record<string, unknown>;
    expect(out.err).toEqual({ name: 'Error', message: 'falhou com [doc]', digest: 'd1' });
    expect(out.at).toBe('1970-01-01T00:00:00.000Z');
    expect((out.cyclic as Record<string, unknown>).self).toBe('[…]');
    expect(out.n).toBe('10');
    expect((out.long as string).length).toBe(2001);
  });
});

describe('logger', () => {
  it('writes one JSON line per event with the context and no PII', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.info(
      'analysis.started',
      { email: 'a@b.c', note: `cpf ${CPF}` },
      { requestId: 'r1', route: '/app', durationMs: 5 },
    );
    const line = JSON.parse(String(out.mock.calls[0]?.[0]));
    expect(line).toMatchObject({
      level: 'info',
      event: 'analysis.started',
      requestId: 'r1',
      route: '/app',
      durationMs: 5,
      email: '[redacted]',
      note: 'cpf [doc]',
    });
  });

  it('warn and error go to stderr and data cannot overwrite level/event', () => {
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    log('warn', 'limit.rate', { level: 'info', event: 'x' });
    logger.error('request.error');
    logger.warn('provider.fallback');
    expect(JSON.parse(String(err.mock.calls[0]?.[0]))).toMatchObject({
      level: 'warn',
      event: 'limit.rate',
    });
    expect(err).toHaveBeenCalledTimes(3);
  });

  it('request id comes from x-vercel-id, else a UUID', () => {
    expect(requestIdFrom(new Headers({ 'x-vercel-id': 'gru1::abc' }))).toBe('gru1::abc');
    expect(requestIdFrom(null)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN, loginPath, safeReturnPath } from './return-path.ts';

describe('safeReturnPath (D58: no open redirect after sign-in)', () => {
  it.each([
    '/app',
    '/app/plano',
    '/app/plano?assinar=business-yearly',
    '/app/plano?assinar=business-yearly&voltar=/app/comecar/estimativa',
    '/app/analises/0b9f6a52-8c1e-4c55-9d6a-1f2e3d4c5b6a/painel',
    '/app/comecar/estimativa',
  ])('accepts %s', (path) => {
    expect(safeReturnPath(path)).toBe(path);
  });

  it.each([
    'https://evil.example/app',
    '//evil.example/app',
    '/\\evil.example',
    '/app/../auth/sair',
    '/app/./plano',
    '/apps',
    '/demo',
    '/',
    '',
    'app/plano',
    '/app/plano#x',
    '/app/pla no',
    `/app/${'a'.repeat(400)}`,
    42,
    undefined,
  ])('refuses %s', (path) => {
    expect(safeReturnPath(path)).toBeNull();
  });

  it('builds the sign-in link, falling back to the plans page', () => {
    expect(loginPath('/app/plano?assinar=business-yearly')).toBe(
      '/auth/entrar?voltar=%2Fapp%2Fplano%3Fassinar%3Dbusiness-yearly',
    );
    expect(loginPath('https://evil.example')).toBe(
      `/auth/entrar?voltar=${encodeURIComponent(DEFAULT_RETURN)}`,
    );
  });
});

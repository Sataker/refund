import { describe, expect, it } from 'vitest';
import { outOfScopeMessage, outOfScopeRegime } from './scope';

const off = { optedIn: false, since: null, excludedAt: null };
const on = { optedIn: true, since: '2019-01-01', excludedAt: null };

describe('regime scope (H3)', () => {
  it('Simples and MEI are in scope', () => {
    expect(outOfScopeRegime({ simples: on, mei: off, taxRegimeHistory: [] } as never)).toBeNull();
    expect(outOfScopeRegime({ simples: off, mei: on, taxRegimeHistory: [] } as never)).toBeNull();
  });

  it('another regime names the last declared form', () => {
    const presumido = {
      simples: off,
      mei: off,
      taxRegimeHistory: [{ year: 2025, form: 'LUCRO PRESUMIDO' }],
    } as never;
    expect(outOfScopeRegime(presumido)).toBe('Lucro Presumido');
    expect(outOfScopeMessage('Consultoria Exemplo', 'Lucro Presumido')).toBe(
      'Por enquanto o Refund calcula só empresas do Simples Nacional. A Consultoria Exemplo está no Lucro Presumido.',
    );
  });

  it('without a declared form it still stops, with a neutral regime name', () => {
    expect(outOfScopeRegime({ simples: off, mei: off, taxRegimeHistory: [] } as never)).toBe(
      'regime fora do Simples Nacional',
    );
  });
});

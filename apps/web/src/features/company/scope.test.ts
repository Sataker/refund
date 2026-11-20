import { describe, expect, it } from 'vitest';
import {
  activityStop,
  companyNameOf,
  outOfScopeMessage,
  outOfScopeRegime,
  regimeStop,
  supportedActivities,
} from './scope';

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

  it('the stop names the legal name, never the trade name of a head office (Banco do Brasil: "DIRECAO GERAL")', () => {
    const bb = {
      simples: off,
      mei: off,
      taxRegimeHistory: [{ year: 2024, form: 'LUCRO REAL' }],
      displayLegalName: 'BANCO DO BRASIL SA',
      displayTradeName: 'DIRECAO GERAL',
      masked: false,
    } as never;
    expect(regimeStop(bb)).toEqual({
      regime: 'Lucro Real',
      message:
        'Por enquanto o Refund calcula só empresas do Simples Nacional. A Banco do Brasil SA está no Lucro Real.',
    });
  });

  it('a masked EI reads "sua empresa", never the mask text', () => {
    expect(
      companyNameOf({ displayLegalName: 'Empresário individual · nome oculto', masked: true }),
    ).toBe('sua empresa');
  });
});

describe('activity scope', () => {
  it('a CNAE in the verified table goes on', () => {
    expect(activityStop({ primaryCnae: { code: '6201-5/01', description: 'x' } })).toBeNull();
  });

  it('a CNAE outside the table stops with its code, its description and the list from the table', () => {
    const stop = activityStop({
      primaryCnae: {
        code: '4772-5/00',
        description:
          'Comércio varejista de cosméticos, produtos de perfumaria e de higiene pessoal',
      },
    });
    expect(stop?.cnae).toBe('4772-5/00');
    expect(stop?.message).toBe(
      `Por enquanto o Refund calcula só estas atividades: ${supportedActivities()}. A sua atividade (4772-5/00 Comércio varejista de cosméticos, produtos de perfumaria e de higiene pessoal) ainda não está na nossa tabela conferida.`,
    );
    expect(supportedActivities()).toContain(
      'desenvolvimento de programas de computador sob encomenda (6201-5/01)',
    );
    expect(supportedActivities()).toContain('web design (6201-5/02)');
    // A to_confirm row (dentistry) is not listed as calculated.
    expect(supportedActivities()).not.toContain('8630-5/04');
  });
});

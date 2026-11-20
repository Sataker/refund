import { describe, expect, it } from 'vitest';
import {
  activityStop,
  companyNameOf,
  outOfScopeMessage,
  outOfScopeRegime,
  regimeStop,
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
  const stop = (code: string, description: string) =>
    activityStop({ primaryCnae: { code, description } });

  it('a CNAE the engine calculates goes on (software; commerce since D50)', () => {
    expect(stop('6201-5/01', 'x')).toBeNull();
    expect(stop('4772-5/00', 'Comércio varejista de cosméticos')).toBeNull();
    expect(stop('8630-5/04', 'Atividade odontológica')).toBeNull(); // D51
  });

  it('Anexo II or IV: the anexo, never a list of activities', () => {
    const s = stop('4120-4/00', 'Construção de edifícios');
    expect(s?.cnae).toBe('4120-4/00');
    expect(s?.message).toBe(
      'Por enquanto o Refund calcula atividades dos Anexos I, III e V do Simples. A sua (4120-4/00 Construção de edifícios) é do Anexo IV.',
    );
    expect(stop('1091-1/01', 'Fabricação de produtos de panificação industrial')?.message).toBe(
      'Por enquanto o Refund calcula atividades dos Anexos I, III e V do Simples. A sua (1091-1/01 Fabricação de produtos de panificação industrial) é do Anexo II.',
    );
  });

  it('impeditive (Res. CGSN 140, Anexo VI)', () => {
    expect(stop('1220-4/01', 'Fabricação de cigarros')?.message).toBe(
      'A atividade 1220-4/01 Fabricação de cigarros não pode estar no Simples Nacional.',
    );
  });

  it('ambiguous', () => {
    const ambiguous =
      'O anexo da sua atividade (4635-4/02) depende do que exatamente a empresa faz; por enquanto não calculamos esse caso.';
    expect(stop('4635-4/02', 'Comércio atacadista de cerveja, chope e refrigerante')?.message).toBe(
      ambiguous,
    );
  });

  it('Anexo III with an adjusted DAS (rental of movable goods; communication)', () => {
    expect(stop('7711-0/00', 'Locação de automóveis sem condutor')?.message).toBe(
      'Por enquanto o Refund calcula atividades dos Anexos I, III e V do Simples na tabela comum. A sua (7711-0/00 Locação de automóveis sem condutor) é do Anexo III sem a parcela do ISS.',
    );
  });

  it('missing from the table', () => {
    expect(stop('0000-0/00', '')?.message).toBe(
      'Não encontramos a atividade 0000-0/00 na tabela oficial.',
    );
  });
});

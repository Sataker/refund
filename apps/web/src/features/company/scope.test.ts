import { describe, expect, it } from 'vitest';
import {
  activityStop,
  companyNameOf,
  outOfScopeMessage,
  outOfScopeRegime,
  regimePhrase,
  regimeStop,
  statusStopMessage,
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
      'Por enquanto o Refund calcula só empresas do Simples Nacional. Consultoria Exemplo está no Lucro Presumido.',
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
      registrationStatus: 'ATIVA',
      masked: false,
    } as never;
    expect(regimeStop(bb)).toEqual({
      reason: 'regime',
      regime: 'Lucro Real',
      message:
        'Por enquanto o Refund calcula só empresas do Simples Nacional. Banco do Brasil SA está no Lucro Real.',
    });
  });

  it('regime phrases: no article, "é isenta de IRPJ" (bug bash 20/11)', () => {
    expect(regimePhrase('Lucro Presumido')).toBe('está no Lucro Presumido');
    expect(regimePhrase('Isenta do IRPJ')).toBe('é isenta de IRPJ');
    expect(regimePhrase('regime fora do Simples Nacional')).toBe('está fora do Simples Nacional');
    expect(outOfScopeMessage('sua empresa', 'Lucro Real')).toBe(
      'Por enquanto o Refund calcula só empresas do Simples Nacional. Sua empresa está no Lucro Real.',
    );
  });

  it('H4: baixada, inapta and suspensa stop with their own reason, before the regime', () => {
    const closed = (registrationStatus: string) =>
      regimeStop({
        simples: off,
        mei: off,
        taxRegimeHistory: [],
        displayLegalName: 'X LTDA',
        masked: false,
        registrationStatus,
      });
    expect(closed('BAIXADA')).toEqual({
      reason: 'status',
      regime: 'baixada',
      message:
        'Esta empresa está baixada na Receita (encerrada). O Refund analisa empresas ativas.',
    });
    expect(closed('INAPTA')?.message).toBe(
      'Esta empresa está inapta na Receita. Regularize a situação com seu contador antes de planejar impostos.',
    );
    expect(closed('SUSPENSA')?.message).toBe(
      'Esta empresa está suspensa na Receita. Regularize a situação com seu contador antes de planejar impostos.',
    );
    expect(closed('ATIVA')?.reason).toBe('regime');
    expect(statusStopMessage('ativa')).toBeNull();
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

  it('Anexos II and IV go on since D52 (industry; construction)', () => {
    expect(stop('4120-4/00', 'Construção de edifícios')).toBeNull();
    expect(stop('1091-1/01', 'Fabricação de produtos de panificação industrial')).toBeNull();
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
      'Por enquanto o Refund calcula os anexos do Simples só na tabela comum. A sua (7711-0/00 Locação de automóveis sem condutor) é do Anexo III sem a parcela do ISS.',
    );
  });

  it('missing from the table', () => {
    expect(stop('0000-0/00', '')?.message).toBe(
      'Não encontramos a atividade 0000-0/00 na tabela oficial.',
    );
  });
});

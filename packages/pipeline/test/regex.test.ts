// ENGINE-SPEC E.3: every regex has 5 positive and 5 negative descriptions (normalized, E.1.5).
import { describe, expect, it } from 'vitest';
import { darfCode, RX_ACCRUAL, RX_JCP } from '../src/classify/regex.ts';
import {
  RX_DARF,
  RX_DAS,
  RX_DAS_MEI,
  RX_DCTFWEB,
  RX_FGTS,
  RX_FX,
  RX_FX_PLATFORMS,
  RX_GPS,
  RX_LOAN,
  RX_PENSION,
  RX_PERSONAL,
} from '../src/index.ts';

const cases: [string, RegExp, string[], string[]][] = [
  [
    'RX_DAS',
    RX_DAS,
    [
      'PAGAMENTO DAS',
      'PGDAS-D 10/2026',
      'SIMPLES NACIONAL',
      'DOC ARRECADACAO SIMPLES',
      'SIMPLESNAC PA 09/2026',
    ],
    ['DASHBOARD SAAS', 'ADASTRA LTDA', 'PIX ENVIADO', 'SIMPLESMENTE CAFE', 'MERCADO DASILVA'],
  ],
  [
    'RX_DAS_MEI',
    RX_DAS_MEI,
    ['DAS MEI', 'DASMEI 10/2026', 'PGMEI', 'SIMEI', 'PAGAMENTO DAS MEI'],
    ['MEIO DE PAGAMENTO', 'DAS SIMPLES', 'PGDAS', 'SIMEIA LTDA', 'MEI LTDA'],
  ],
  [
    'RX_DARF',
    RX_DARF,
    ['DARF', 'PAGAMENTO DARF 1841', 'DARF NUMERADO', 'DARF COMUM 0588', 'GUIA DARF'],
    ['DARFUR', 'DAF', 'DARFS', 'ADARF', 'DA RF'],
  ],
  [
    'RX_DCTFWEB',
    RX_DCTFWEB,
    ['DCTFWEB', 'DCTF WEB', 'DARF NUMERADO', 'DARFNUMERADO', 'PAGAMENTO DCTFWEB PA 10/2026'],
    ['DCTF', 'DARF 1841', 'WEB DESIGN', 'DCTFWEBX', 'NUMERADO'],
  ],
  [
    'RX_FGTS',
    RX_FGTS,
    ['FGTS', 'GRF', 'FGTS DIGITAL', 'GFD COMP 10/2025', 'GUIA FGTS'],
    ['FGT', 'GRFX', 'GFDX', 'GRAFICA', 'FGTSX'],
  ],
  [
    'RX_GPS',
    RX_GPS,
    ['GPS', 'INSS', 'GPS 2003', 'PAGAMENTO INSS', 'GUIA GPS'],
    ['GP S', 'INS', 'GPSTRACK', 'INSSTITUTO', 'TRANSPORTES'],
  ],
  [
    'RX_FX',
    RX_FX,
    [
      'CAMBIO',
      'CONTRATO DE CAMBIO 123',
      'ORDEM DE PAGAMENTO DO EXTERIOR',
      'REMESSA RECEBIDA',
      'SWIFT TRANSFER',
    ],
    ['CAMBIOS', 'EXTERIOR PINTURAS', 'WIRELESS', 'SWIFTY', 'REMESSA ENVIADA'],
  ],
  [
    'RX_FX_PLATFORMS',
    RX_FX_PLATFORMS,
    ['PAYONEER', 'WISE', 'DEEL INC', 'HUSKY', 'REMESSA ONLINE'],
    ['WISEMAN', 'DEELIGHT', 'HUSKYS', 'PAYONEERX', 'ONLINE STORE'],
  ],
  [
    'RX_LOAN',
    RX_LOAN,
    ['EMPRESTIMO', 'CREDITO PESSOAL', 'CAPITAL DE GIRO', 'PRONAMPE', 'ANTECIPACAO DE RECEBIVEIS'],
    ['EMPRESTIMOS', 'CREDITO', 'GIRO', 'PRONAMP', 'ANTECIPA'],
  ],
  [
    'RX_PENSION',
    RX_PENSION,
    ['PGBL', 'PREVIDENCIA PRIVADA', 'PREV PRIVADA', 'APORTE PGBL', 'PREVIDENCIA PRIVADA XP'],
    ['VGBL', 'PREVIDENCIA SOCIAL', 'PREV', 'PRIVADA', 'PGBLX'],
  ],
  [
    'RX_PERSONAL (E.7)',
    RX_PERSONAL,
    ['NETFLIX.COM', 'SPOTIFY P1', 'SMARTFIT UNIDADE 3', 'SUPERMERC VILA SERENA', 'SUPERMERCADO X'],
    ['AMAZON WEB SERVICES', 'RESTAURANTE BOM PRATO', 'LATAM AIRLINES', 'UBER TRIP', 'POSTO SHELL'],
  ],
];

describe.each(cases)('%s', (_name, rx, positives, negatives) => {
  it.each(positives)('matches %s', (d) => expect(rx.test(d)).toBe(true));
  it.each(negatives)('does not match %s', (d) => expect(rx.test(d)).toBe(false));
});

describe('helpers', () => {
  it('darfCode needs DARF and the code as a whole token', () => {
    expect(darfCode('PAGAMENTO DARF 1841 - IRRF', '1841')).toBe(true);
    expect(darfCode('PAGAMENTO 1841', '1841')).toBe(false);
    expect(darfCode('DARF 18410', '1841')).toBe(false);
  });

  it('RX_ACCRUAL reads PA and COMP', () => {
    expect(RX_ACCRUAL.exec('DAS PA 07/2026')?.slice(1)).toEqual(['07', '2026']);
    expect(RX_ACCRUAL.exec('GFD COMP 10/2025')?.slice(1)).toEqual(['10', '2025']);
  });

  it('RX_JCP spots interest on equity (T02-11)', () => {
    expect(RX_JCP.test('PIX JCP 2026')).toBe(true);
    expect(RX_JCP.test('JUROS SOBRE CAPITAL PROPRIO')).toBe(true);
    expect(RX_JCP.test('DISTRIBUICAO DE LUCROS')).toBe(false);
  });
});

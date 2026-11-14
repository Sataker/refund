import { describe, expect, it } from 'vitest';
import { NCM_ROWS, NCM_TABLE_SOURCE, ncmRegime } from '../src/index.ts';

describe('ncmRegime (EFD-Contribuições table 4.3.10 v1.25, frozen)', () => {
  it('records its source and hash', () => {
    expect(NCM_TABLE_SOURCE).toMatchObject({ version: '1.25', updatedAt: '2026-03-30' });
    expect(NCM_TABLE_SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const row of NCM_ROWS) {
      expect(row.prefix).toMatch(/^\d{2,8}$/);
      expect(row.law).toMatch(/^(Lei|LC) /);
    }
  });

  it.each([
    ['3004.90.99', true, '3004', 'Lei 10.147/2000, art. 1º, I, a'],
    ['30049099', true, '3004', 'Lei 10.147/2000, art. 1º, I, a'],
    ['3002.10.39', true, '3002103', 'Lei 10.147/2000, art. 1º, I, a'],
    ['3305.10.00', true, '3305', 'Lei 10.147/2000, art. 1º, I, b'],
    ['2710.12.59', true, '27101259', 'Lei 9.718/1998, art. 4º'],
    ['4011.10.00', true, '4011', 'Lei 10.485/2002, art. 5º'],
    ['8703.23.10', true, '8703', 'Lei 10.485/2002, art. 1º (redação da Lei 12.973/2014)'],
    ['2203.00.00', true, '2203', 'Lei 13.097/2015, arts. 25 e 34'],
  ])('%s → monofásico %s by the longest prefix %s', (ncm, monofasico, prefix, law) => {
    expect(ncmRegime(ncm)).toEqual({ monofasico, law, prefix });
  });

  it('explicit exceptions of the law win over the shorter prefix', () => {
    expect(ncmRegime('3004.90.46')).toEqual({
      monofasico: false,
      law: 'Lei 10.147/2000, art. 1º, I, a',
      prefix: '30049046',
    });
    expect(ncmRegime('30039056').monofasico).toBe(false);
  });

  it.each([['8471.30.12'], ['8708.29.99'], ['abc'], ['1'], ['123456789'], ['']])(
    '%s → not monofásico, no law',
    (ncm) => {
      expect(ncmRegime(ncm)).toEqual({ monofasico: false, law: null, prefix: null });
    },
  );
});

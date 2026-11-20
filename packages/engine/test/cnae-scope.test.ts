// ENGINE-SPEC C.11.5, item 4: the CNAE test of the estimate, shared with the live track's activity stop.
import { describe, expect, it } from 'vitest';
import { CNAE_ANEXO, CNAE_IN_SCOPE, cnaeInScope } from '../src/index.ts';

describe('CNAE scope (C.11.5 item 4)', () => {
  it('only verified rows outside Anexos II and IV are in scope', () => {
    expect(CNAE_IN_SCOPE.length).toBeGreaterThan(0);
    for (const row of CNAE_ANEXO) {
      const expected =
        row.status === 'verified' && row.baseAnexo !== 'II' && row.baseAnexo !== 'IV';
      expect(cnaeInScope(row.cnae)).toBe(expected);
      expect(CNAE_IN_SCOPE.includes(row)).toBe(expected);
    }
  });

  it('a CNAE outside the table (cosmetics retail) is out of scope', () => {
    expect(cnaeInScope('4772-5/00')).toBe(false);
    expect(cnaeInScope('')).toBe(false);
  });
});

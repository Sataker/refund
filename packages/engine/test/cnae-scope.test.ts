// ENGINE-SPEC C.11.5, item 4: the CNAE test of the estimate, shared with the live track's activity stop.
import { describe, expect, it } from 'vitest';
import { CNAE_ANEXO, CNAE_IN_SCOPE, cnaeInScope } from '../src/index.ts';

describe('CNAE scope (C.11.5 item 4)', () => {
  it('only verified rows with the plain table are in scope (any anexo; II and IV since D52)', () => {
    expect(CNAE_IN_SCOPE.length).toBeGreaterThan(0);
    for (const row of CNAE_ANEXO) {
      const expected =
        row.status === 'verified' && row.baseAnexo !== null && row.anexoAdjustment === undefined;
      expect(cnaeInScope(row.cnae)).toBe(expected);
      expect(CNAE_IN_SCOPE.includes(row)).toBe(expected);
    }
  });

  it('ambiguous, impeditive, adjusted and unknown CNAEs are out of scope', () => {
    expect(cnaeInScope('4635-4/02')).toBe(false); // Res. CGSN 140, Anexo VII (ambiguous)
    expect(cnaeInScope('1220-4/01')).toBe(false); // Res. CGSN 140, Anexo VI (impeditive)
    expect(cnaeInScope('7711-0/00')).toBe(false); // Anexo III without the ISS share
    expect(cnaeInScope('')).toBe(false);
    expect(cnaeInScope('0000-0/00')).toBe(false);
  });

  it('Anexos II and IV are in scope since D52 (industry; construction, LC 123, art. 18, § 5º-C, I)', () => {
    expect(cnaeInScope('1091-1/01')).toBe(true);
    expect(cnaeInScope('4120-4/00')).toBe(true);
  });

  it('commerce is in scope since D50 (cosmetics retail, Anexo I)', () => {
    expect(cnaeInScope('4772-5/00')).toBe(true);
    // D51: dentistry, LC 123, art. 18, § 5º-B, XX + § 5º-M, I.
    expect(cnaeInScope('8630-5/04')).toBe(true);
  });
});

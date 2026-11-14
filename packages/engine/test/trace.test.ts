// ENGINE-SPEC C.1, item 4 and C.10: a step built from a parameter not yet published for its month says so.
import { describe, expect, it } from 'vitest';
import { brl } from '../src/money.ts';
import { param } from '../src/parameters/index.ts';
import { monthlyIr } from '../src/primitives/irpf.ts';
import { projectedNote, step } from '../src/trace.ts';

describe('projected parameters in the trace (C.1, item 4)', () => {
  it('flags the 2027 monthly IR table, which is still the 2026 one', () => {
    const r = monthlyIr(brl('6.000,00'), brl('649,60'), 0, '2027-03');
    const table = r.steps.find((s) => s.id === 'IR.TABLE_TAX.2027-03');
    expect(table?.projectedNote).toBe('parâmetro de 2027 ainda não publicado; usado o de 2026');
  });

  it('leaves published parameters unflagged', () => {
    const r = monthlyIr(brl('6.000,00'), brl('649,60'), 0, '2026-03');
    expect(r.steps.every((s) => s.projectedNote === undefined)).toBe(true);
  });

  it('writes a generic note when the step has no month', () => {
    const s = step({
      id: 'X',
      label: 'x',
      formula: 'x',
      inputs: {},
      result: { value: 0, unit: 'cents' },
      rounding: 'NONE',
      parameter: param('minimumWage', '2027-05'),
    });
    expect(s.projectedNote).toBe('parâmetro ainda não publicado; usado o de 2026');
    expect(projectedNote({ effectiveFrom: '2026-01' }, '2028-01')).toBe(
      'parâmetro de 2028 ainda não publicado; usado o de 2026',
    );
  });
});

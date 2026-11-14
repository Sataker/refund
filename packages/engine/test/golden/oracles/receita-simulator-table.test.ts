// ENGINE-SPEC B.2: the monthly 2026 parameters must match the Receita simulator's public table, captured on
// 12/11/2026 (copy of the raw response in ./sources). The annual part of that response is NOT an oracle (G6).
import { describe, expect, it } from 'vitest';
import { brl, D, toCents } from '../../../src/money.ts';
import { param } from '../../../src/parameters/index.ts';
import rawTable from './sources/receita-simulador-tab2026.json' with { type: 'json' };
import { SOURCES } from './sources.ts';

interface SimulatorTable {
  anoCalendario: string;
  vaDeducSimpMe: number[];
  vaDedDependenteMe: number[];
  gpFaixasTblProg: { peFaixa: number; vaAjLimiteMe: number[]; vaAjDescontoMe: number[] }[];
  gpFaixasTblIsencao: {
    coeficienteReducao: number[];
    limiteRendTributavel: number[];
    vaMaximoReducao: number[];
  }[];
}
const table: SimulatorTable = rawTable;
const reaisToCents = (n: number | undefined) => toCents(D(String(n)));

describe('ENGINE-SPEC B.2 — Receita simulator table 2026 × parameters/2026.ts', () => {
  it(`is the 2026 table captured from ${SOURCES.receitaSimulatorTable2026.url}`, () => {
    // The copy in ./sources is byte-identical to the capture (SHA-256 pinned in sources.ts and in FONTE.md).
    expect(table.anoCalendario).toBe('2026');
  });

  for (const month of ['2026-01', '2026-06', '2026-12'] as const) {
    const i = Number(month.slice(5)) - 1;

    it(`${month}: progressive table (limits, rates, deductions)`, () => {
      const brackets = param('irpf.monthly.table', month).value.brackets;
      expect(brackets).toHaveLength(table.gpFaixasTblProg.length);
      table.gpFaixasTblProg.forEach((row, k) => {
        const b = brackets[k];
        expect(
          D(b?.rate ?? 'NaN')
            .times(100)
            .toNumber(),
        ).toBe(row.peFaixa);
        expect(b?.deduction).toBe(reaisToCents(row.vaAjDescontoMe[i]));
        // The simulator repeats the previous limit on the last bracket ("above").
        if (b?.upTo !== null) expect(b?.upTo).toBe(reaisToCents(row.vaAjLimiteMe[i]));
      });
    });

    it(`${month}: simplified discount 607,20 and dependent 189,59`, () => {
      expect(param('irpf.monthly.simplifiedDiscount', month).value).toBe(
        reaisToCents(table.vaDeducSimpMe[i]),
      );
      expect(param('irpf.monthly.dependent', month).value).toBe(
        reaisToCents(table.vaDedDependenteMe[i]),
      );
    });

    it(`${month}: Lei 15.270 reduction (gpFaixasTblIsencao)`, () => {
      const r = param('irpf.monthly.reduction', month).value;
      const [full, linear] = table.gpFaixasTblIsencao;
      expect(r.fullUpTo).toBe(reaisToCents(full?.limiteRendTributavel[i]));
      expect(r.full).toBe(reaisToCents(full?.vaMaximoReducao[i]));
      expect(r.linearUpTo).toBe(reaisToCents(linear?.limiteRendTributavel[i]));
      expect(r.constant).toBe(reaisToCents(linear?.vaMaximoReducao[i]));
      expect(D(r.coefficient).toNumber()).toBe(linear?.coeficienteReducao[i]);
    });
  }

  it('the simplified discount is 25% of the zero-rate limit (Lei 9.250, art. 4º, § 2º)', () => {
    const zeroLimit = param('irpf.monthly.table', '2026-01').value.brackets[0]?.upTo;
    expect(zeroLimit).toBe(brl('2.428,80'));
    expect(
      toCents(
        D(zeroLimit ?? 0)
          .times('0.25')
          .dividedBy(100),
      ),
    ).toBe(brl('607,20'));
  });
});

// Scenarios that, with the hero, make every rule fire at least once (R01–R06, R05-REC, R02, R03, A01, A02). Shared by
// the reference check (law-refs.test.ts) and the action plan (action-plan.test.ts).
import { brl } from '../../../src/money.ts';
import { cnaeAnexoRow, syntheticFacts as profileFacts, profileGrid } from '../../../src/profile.ts';
import type { Cents, Facts } from '../../../src/types.ts';
import { constant, fact, syntheticFacts } from './facts.ts';
import { allAnswers, HERO_PROFILE } from './profile.ts';

export function ruleScenarios(): Record<string, Facts> {
  const pharmacy = syntheticFacts({
    domestic: constant(brl('50.000,00')),
    subjectToFatorR: false,
    baseAnexo: 'I',
    assumptions: {
      monofasicoPct: { value: '0.4', origin: 'user', editable: true, source: 'slider' },
    },
  });
  pharmacy.companyDetails.value.resellsMonofasico = true;
  const pharmacyNoPct = syntheticFacts({
    domestic: constant(brl('50.000,00')),
    subjectToFatorR: false,
    baseAnexo: 'I',
  });
  pharmacyNoPct.companyDetails.value.resellsMonofasico = true;
  const mei = syntheticFacts({ regime: 'MEI', domestic: constant(brl('8.100,00')) });
  const large = syntheticFacts({ domestic: constant(brl('250.000,00')), subjectToFatorR: false });
  const a02 = syntheticFacts({
    domestic: constant(brl('50.000,00')),
    proLabore: constant(0 as Cents),
    distributions: [
      {
        month: '2026-10',
        payerCnpj: 'RFTEST00000100',
        grossAmount: brl('20.000,00'),
        irrfWithheld: 0 as Cents,
        profitThrough2025Approved: false,
      },
    ],
  });
  const pgbl = syntheticFacts({
    domestic: constant(brl('60.000,00')),
    cltGross: constant(brl('15.000,00')),
    proLabore: constant(brl('3.000,00')),
    otherTaxableIncome: constant(brl('12.000,00')),
  });
  pgbl.personalExpensesInPj = fact([
    { transactionId: 't', month: '2026-05', amount: 5590 as Cents, merchant: 'NETFLIX' },
  ]);
  return { pharmacy, pharmacyNoPct, mei, large, a02, pgbl };
}

/** Every boundary scenario of the C.11 grid for the hero's CNAE (6201-5/01), deduplicated by id, analysed on 12/11. */
export function profileGridFacts(): Facts[] {
  const row = cnaeAnexoRow(HERO_PROFILE.primaryCnae);
  if (row === undefined) throw new Error('6201-5/01 missing from cnae-anexo.json');
  const seen = new Map<string, Facts>();
  for (const answers of allAnswers()) {
    for (const point of profileGrid(
      answers.monthlyRevenueBracket,
      answers,
      true,
      162100 as Cents,
    )) {
      if (!seen.has(point.id))
        seen.set(point.id, profileFacts(HERO_PROFILE, row, point, '2026-11-12'));
    }
  }
  return [...seen.values()];
}

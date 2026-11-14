// Relative imports: Vitest (root config) has no `@/` alias.
// Numbers and citations of the landing (IDENTITY-AND-UI Screen 0, §5.12). Nothing is typed by hand:
// amounts come from the hero persona's answer key (ENGINE-SPEC F.4, pinned by the golden tests), citations
// from @refund/law (CLAUDE.md rule 3). When E12 ships the /demo snapshot, swap the source for it.
import type { CivilDate, Confidence, LegalRef, Trace, YearMonth } from '@refund/engine';
import { addMonths, displayFatorR, rate } from '@refund/engine';
import { article } from '@refund/law';
import type { AnswerKey, ExpectedFinding, PersonaData } from '@refund/personas';
import answerKeyJson from '@refund/personas/data/dev-exportador.answer-key.json' with {
  type: 'json',
};
import personaJson from '@refund/personas/data/dev-exportador.json' with { type: 'json' };
import type { LawSealRef } from '../../components/brand/law-seal.tsx';
import { formatYearMonth } from '../../lib/format.ts';

const answerKey = answerKeyJson as unknown as AnswerKey;
const persona = personaJson as unknown as PersonaData;

function legalRef(id: string): LegalRef {
  const p = article(id);
  if (!p) throw new Error(`LAW_REF_MISSING: ${id} is not in @refund/law`);
  return { id: p.id, label: p.label, url: p.url, verifiedAt: p.capturedAt as CivilDate };
}

function finding(ruleId: ExpectedFinding['ruleId']): ExpectedFinding {
  const f = answerKey.expectedFindings.find((x) => x.ruleId === ruleId);
  if (!f) throw new Error(`FINDING_MISSING: ${ruleId}`);
  return f;
}

function cents(value: number | null | undefined, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`CENTS_MISSING: ${what}`);
  }
  return value;
}

function videoNumber(testId: string): number {
  const v = answerKey.videoNumbers.find((n) => n.testId === testId);
  return cents(v?.cents, `videoNumbers ${testId}`);
}

function detail(f: ExpectedFinding, key: string): number {
  return cents(f.details[key] as number | undefined, `${f.ruleId}.details.${key}`);
}

/** "MARINA DEV LTDA" → "Marina Dev Ltda". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export interface LandingFinding {
  ruleId: string;
  title: string;
  cents: number;
  annualRegimeCents: number;
  confidence: Confidence;
  lawRef: LawSealRef;
}

const r01 = finding('R01');
const r05 = finding('R05');
const recoveryRange = answerKey.total.recoveryRange;
if (!recoveryRange) throw new Error('RECOVERY_RANGE_MISSING');

// Citations: the provision each rule rests on (ENGINE-SPEC A.2: Fator R in § 5º-J; exports in § 4º-A).
const FATOR_R_REF = legalRef('lc123-2006/art18/p5-j');
const EXPORT_REF = legalRef('lc123-2006/art18/p4-a');

const start = (r01.details.start ?? '') as YearMonth;
const horizon = `${formatYearMonth(start)} a ${formatYearMonth(addMonths(start, 11))}`;
const regimeFrom = r01.regimeFrom;
if (!regimeFrom) throw new Error('REGIME_FROM_MISSING');

export const hero = {
  firstName: persona.holderDisplayName,
  companyName: titleCase(persona.company.displayLegalName),
  cnae: persona.company.primaryCnae.code,
  /** Next 12 months (ENGINE-SPEC F.4, the video number). */
  savings12m: videoNumber('dashboard/money-hero'),
  /** Per year once the regime stabilizes. */
  annualRegime: videoNumber('dashboard/regime-total'),
  regimeFrom,
  recoveryMin: videoNumber('dashboard/recovery-min'),
  recoveryMax: videoNumber('dashboard/recovery-max'),
  horizon,
  findings: [
    {
      ruleId: 'R05',
      title: 'Separar a receita de exportação no PGDAS-D',
      cents: cents(r05.marginalValue12m, 'R05.marginalValue12m'),
      annualRegimeCents: cents(r05.annualRegimeValue, 'R05.annualRegimeValue'),
      confidence: r05.confidence ?? 'confirmed',
      lawRef: EXPORT_REF,
    },
    {
      ruleId: 'R01',
      title: 'Aumentar seu pró-labore reduz seu imposto',
      cents: cents(r01.marginalValue12m, 'R01.marginalValue12m'),
      annualRegimeCents: cents(r01.annualRegimeValue, 'R01.annualRegimeValue'),
      confidence: r01.confidence ?? 'confirmed',
      lawRef: FATOR_R_REF,
    },
  ] satisfies LandingFinding[],
} as const;

/**
 * R01 as a readable trace for the "a conta é o produto" block. Every value is a field of the answer key;
 * labels and formulas are the plain description of ENGINE-SPEC D.1 and F.3 (step 3). The engine's own
 * `Finding.trace` replaces this once the /demo snapshot exists (E12).
 */
export const heroR01Trace: Trace = [
  {
    id: 'R01.FATOR_R.current',
    label: 'Fator R hoje',
    formula: 'folha dos últimos 12 meses ÷ faturamento dos últimos 12 meses',
    inputs: {
      folha: { value: answerKey.expectedFacts.fs12, unit: 'cents' },
      faturamento: { value: answerKey.expectedFacts.rbt12, unit: 'cents' },
    },
    result: { value: displayFatorR(rate(answerKey.expectedFacts.fatorR)), unit: 'rate' },
    rounding: 'TRUNC_2_DECIMALS_DISPLAY',
    ref: FATOR_R_REF,
  },
  {
    id: 'R01.PRO_LABORE.target',
    label: 'Pró-labore que leva o Fator R a 28% (com margem de segurança)',
    formula: '(29% × faturamento 12 meses − folha sem o pró-labore) ÷ 12',
    inputs: { 'pró-labore hoje': { value: detail(r01, 'currentProLabore'), unit: 'cents' } },
    result: { value: detail(r01, 'proLaboreTarget'), unit: 'cents' },
    rounding: 'HALF_UP_CENT',
  },
  {
    id: 'R01.COST.S0',
    label: `Custo em 12 meses, como está (${horizon})`,
    formula: 'DAS + INSS do sócio + IR do ajuste anual',
    inputs: {},
    result: { value: detail(r01, 'cost12mS0'), unit: 'cents' },
    rounding: 'HALF_UP_CENT',
  },
  {
    id: 'R01.COST.S1',
    label: `Custo em 12 meses com o novo pró-labore (Anexo III a partir de ${formatYearMonth(regimeFrom)})`,
    formula: 'DAS + INSS do sócio + IR do ajuste anual',
    inputs: {},
    result: { value: detail(r01, 'cost12mS1'), unit: 'cents' },
    rounding: 'HALF_UP_CENT',
  },
  {
    id: 'R01.SAVINGS.12m',
    label: 'Quanto você paga a menos em 12 meses',
    formula: 'custo como está − custo com o novo pró-labore',
    inputs: {},
    result: { value: cents(r01.marginalValue12m, 'R01.marginalValue12m'), unit: 'cents' },
    rounding: 'HALF_UP_CENT',
    ref: FATOR_R_REF,
  },
];

/** The provision text shown highlighted in the dark block (verbatim from @refund/law). */
export const fatorRProvision = {
  label: FATOR_R_REF.label,
  url: FATOR_R_REF.url,
  text: article(FATOR_R_REF.id)?.text ?? '',
};

/** §5.12 section 3: three changes, each with its date and §. */
export const lawChanges = {
  dividends: legalRef('lei9250-1995/art6-a'),
  cbsExport: legalRef('lc214-2025/art79'),
  mei: legalRef('lc238-2026/art2'),
};

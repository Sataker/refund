import { describe, expect, it } from 'vitest';
import type { ClassificationLabel } from '../src/index.ts';
import { committedAnswerKey, committedData, normalize, rows } from './helpers.ts';

// ENGINE-SPEC E.3 regexes, copied verbatim (the pipeline owns them from E9; personas cannot import
// the pipeline, TESTS §1). The hero's descriptions must be classified by these rules exactly.
const RX_DAS = /\b(DAS|PGDAS|SIMPLES ?NAC(IONAL)?|DOC(UMENTO)? ARRECAD(ACAO)? SIMPLES)\b/u;
const RX_DAS_MEI = /\b(DAS ?MEI|PGMEI|SIMEI)\b/u;
const RX_DARF = /\bDARF\b/u;
const RX_DCTFWEB = /\bDCTF ?WEB\b|\bDARF ?NUMERADO\b/u;
const RX_FGTS = /\b(FGTS|GRF|FGTS DIGITAL|GFD)\b/u;
const RX_GPS = /\b(GPS|INSS)\b/u;
const RX_FX =
  /\b(CAMBIO|CONTRATO DE CAMBIO|ORDEM DE PAG(AMENTO|TO)? (DO |DE )?EXTERIOR|OP EXTERIOR|REMESSA (RECEBIDA|DO EXTERIOR)|SWIFT|WIRE)\b/u;
const RX_FX_PLATFORMS = /\b(PAYONEER|WISE|DEEL|HUSKY|REMESSA ONLINE)\b/u;
const RX_LOAN = /\b(EMPRESTIMO|CREDITO PESSOAL|CAPITAL DE GIRO|PRONAMPE|ANTECIPACAO)\b/u;
const RX_PENSION = /\b(PGBL|PREVIDENCIA PRIVADA|PREV PRIVADA)\b/u;
// ENGINE-SPEC E.7 (personal expense in the PJ).
const RX_PERSONAL =
  /\b(NETFLIX|SPOTIFY|DISNEY|HBO|MAX|PRIME VIDEO|GLOBOPLAY|DEEZER|YOUTUBE PREMIUM|APPLE\.COM\/BILL|SMART ?FIT|BLUEFIT|SUPERMERC|ATACADAO|ASSAI|CARREFOUR|PAO DE ACUCAR|HORTIFRUTI)\b/;
const PERSONAL_MCC = new Set([
  '5411',
  '4899',
  '5815',
  '5816',
  '5817',
  '5818',
  '7997',
  '8211',
  '8220',
]);

const all = rows(committedData(), committedAnswerKey());
const described = all.map((r) => ({ ...r, text: normalize(r.tx.description) }));
const withLabel = (label: ClassificationLabel) => described.filter((r) => r.key.label === label);
const without = (label: ClassificationLabel) => described.filter((r) => r.key.label !== label);

describe('hero descriptions × ENGINE-SPEC E.3 regexes', () => {
  it('das_simples: RX_DAS on every DAS and on nothing else; never RX_DAS_MEI', () => {
    for (const r of withLabel('das_simples')) expect(r.text).toMatch(RX_DAS);
    for (const r of without('das_simples')) expect(r.text).not.toMatch(RX_DAS);
    for (const r of described) expect(r.text).not.toMatch(RX_DAS_MEI);
  });

  it('dctfweb: RX_DCTFWEB on every DCTFWeb and on nothing else', () => {
    for (const r of withLabel('dctfweb')) expect(r.text).toMatch(RX_DCTFWEB);
    for (const r of without('dctfweb')) expect(r.text).not.toMatch(RX_DCTFWEB);
  });

  it('darf_irrf_dividends: RX_DARF + code 1841; no other DARF carries a revenue code', () => {
    for (const r of withLabel('darf_irrf_dividends')) {
      expect(r.text).toMatch(RX_DARF);
      expect(r.text).toMatch(/\b1841\b/);
    }
    for (const r of without('darf_irrf_dividends')) {
      expect(r.text).not.toMatch(/\b(1841|0561|0588|0190)\b/);
    }
    const darfs = described.filter((r) => RX_DARF.test(r.text)).map((r) => r.key.label);
    expect(new Set(darfs)).toEqual(new Set(['darf_irrf_dividends', 'dctfweb']));
  });

  it('fgts: RX_FGTS on every FGTS and on nothing else; RX_GPS on nothing', () => {
    for (const r of withLabel('fgts')) expect(r.text).toMatch(RX_FGTS);
    for (const r of without('fgts')) expect(r.text).not.toMatch(RX_FGTS);
    for (const r of described) expect(r.text).not.toMatch(RX_GPS);
  });

  it('export_revenue: RX_FX on every FX credit (method FX) and on nothing else', () => {
    for (const r of withLabel('export_revenue')) {
      expect(r.text).toMatch(RX_FX);
      expect(r.tx.method).toBe('FX');
      expect(r.tx.amountCents).toBeGreaterThan(0);
    }
    for (const r of without('export_revenue')) {
      expect(r.text).not.toMatch(RX_FX);
      expect(r.text).not.toMatch(RX_FX_PLATFORMS);
    }
  });

  it('no loan, pension or carnê-leão signal anywhere', () => {
    for (const r of described) {
      expect(r.text).not.toMatch(RX_LOAN);
      expect(r.text).not.toMatch(RX_PENSION);
    }
  });

  it('personal_in_pj (E.7): only on the PJ card, by keyword and MCC', () => {
    for (const r of withLabel('personal_in_pj')) {
      expect(r.holder).toBe('PJ');
      expect(r.text).toMatch(RX_PERSONAL);
      expect(PERSONAL_MCC.has(r.tx.mcc ?? '')).toBe(true);
    }
    for (const r of without('personal_in_pj').filter((x) => x.holder === 'PJ')) {
      expect(r.text).not.toMatch(RX_PERSONAL);
    }
  });

  it('PJ → person transfers go to a CPF without a name (pró-labore, distribution, salary)', () => {
    for (const label of ['pro_labore', 'distribution', 'salary'] as const) {
      for (const r of withLabel(label).filter((x) => x.holder === 'PJ')) {
        expect(r.tx.method).toBe('PIX');
        expect(r.tx.counterparty?.document?.type).toBe('CPF');
        expect(r.tx.counterparty?.name).toBeNull();
        expect(r.text.startsWith('PIX ENVIADO [PESSOA]')).toBe(true);
      }
    }
  });

  it('PF health and gym: the counterparty CNAE drives the E.6 rule', () => {
    for (const r of withLabel('deductible_health'))
      expect(r.tx.counterparty?.cnae).toBe('6550-2/00');
    for (const r of withLabel('non_deductible')) expect(r.tx.counterparty?.cnae).toBe('9313-1/00');
    for (const r of withLabel('health_to_confirm')) {
      expect(r.tx.counterparty?.document?.type).toBe('CPF');
      expect(r.tx.counterparty?.cnae).toBeNull();
    }
  });
});

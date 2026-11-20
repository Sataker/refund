import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CNPJ_SOURCES,
  type Cnpj,
  type CnpjSource,
  detectPii,
  MASKED_LEGAL_NAME,
  publicCompanySchema,
  sanitizationOf,
  sanitizeCnpjaCompany,
  sanitizeMinhaReceitaCompany,
  sanitizeOpenCnpjCompany,
  sanitizeReceitaWsCompany,
} from '../src/index.ts';
import { CPF, PERSONAL_EMAIL, PHONE } from './helpers.ts';

// Adapter tests from the reduced raw answers of 20/11/2026 (scripts/record-fixtures.ts
// --source=cnpj-raw): Banco do Brasil S.A., a listed company whose registry data is public.

const BB = '00000000000191' as Cnpj;
const fetchedAt = '2026-11-20T12:00:00.000Z';
const partner = 'FULANA DE TAL SOCIA';

function fixture(source: CnpjSource): Record<string, unknown> {
  const path = new URL(`./fixtures/cnpj/${source}.${BB}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, 'utf8')).raw as Record<string, unknown>;
}

const clone = <T>(v: T): T => structuredClone(v);

describe.each(CNPJ_SOURCES.map((s) => [s.source, s] as const))('%s adapter', (source, spec) => {
  const raw = fixture(source);

  it('maps the recorded answer to the whitelisted company', () => {
    const r = spec.sanitize(raw, BB, fetchedAt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(publicCompanySchema.safeParse(r.value).success).toBe(true);
    expect(r.value).toMatchObject({
      cnpj: BB,
      displayLegalName: 'BANCO DO BRASIL SA',
      masked: false,
      legalNature: { code: '2038', description: 'Sociedade de Economia Mista' },
      size: 'OTHER',
      primaryCnae: { code: '6422-1/00', description: 'Bancos múltiplos, com carteira comercial' },
      registrationStatus: 'ATIVA',
      activityStartDate: '1966-08-01',
      uf: 'DF',
      // Non-optant with equal opt-in and exclusion dates: dates dropped (research 03 §2.1).
      simples: { optedIn: false, since: null, excludedAt: null },
      mei: { optedIn: false, since: null, excludedAt: null },
      source,
      fetchedAt,
    });
    expect(r.value.displayTradeName?.toUpperCase()).toBe('DIRECAO GERAL');
    expect(detectPii(r.value)).toEqual([]);
  });

  it('never lets partners, contacts or address through, even when the answer carries them', () => {
    const poisoned = {
      ...clone(raw),
      qsa: [{ nome_socio: partner, cnpj_cpf_do_socio: CPF }],
      QSA: [{ nome_socio: partner }],
      socios: [{ nome: partner }],
      email: PERSONAL_EMAIL,
      telefone: PHONE,
      logradouro: 'RUA DA SOCIA',
    };
    const r = spec.sanitize(poisoned, BB, fetchedAt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = JSON.stringify(r.value);
    for (const leak of [partner, CPF, PERSONAL_EMAIL, PHONE, 'RUA DA SOCIA']) {
      expect(out).not.toContain(leak);
    }
    expect(sanitizationOf(r.value)?.discardedFields).toEqual(
      expect.arrayContaining(['email', 'logradouro']),
    );
  });

  it('refuses another shape or another CNPJ', () => {
    expect(spec.sanitize('<html>', BB, fetchedAt)).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE', source },
    });
    expect(spec.sanitize(raw, '12ABC34501DE35' as Cnpj, fetchedAt)).toMatchObject({
      ok: false,
      error: { code: 'UNEXPECTED_RESPONSE' },
    });
  });

  it('reduced fixture keeps no partner key', () => {
    const text = JSON.stringify(raw);
    for (const key of ['qsa', 'QSA', 'socios', 'members', 'email', 'telefone', 'phones']) {
      expect(text).not.toContain(`"${key}"`);
    }
  });
});

describe('OpenCNPJ specifics', () => {
  const raw = fixture('opencnpj');

  it('Simples optant with dates; "0000-00-00" means no date', () => {
    const r = sanitizeOpenCnpjCompany(
      {
        ...raw,
        porte_empresa: 'Microempresa (ME)',
        opcao_simples: 'S',
        data_opcao_simples: '2010-09-10',
        data_exclusao_simples: '0000-00-00',
      },
      BB,
      fetchedAt,
    );
    expect(r.ok && r.value.simples).toEqual({
      optedIn: true,
      since: '2010-09-10',
      excludedAt: null,
    });
    expect(r.ok && r.value.size).toBe('ME');
    expect(r.ok && r.value.ibgeMunicipality).toBeNull();
  });

  it('secondary CNAEs come from `cnaes` without the principal one', () => {
    const r = sanitizeOpenCnpjCompany(raw, BB, fetchedAt);
    expect(r.ok && r.value.secondaryCnaes).toEqual([
      {
        code: '6499-9/99',
        description: 'Outras atividades de serviços financeiros não especificadas anteriormente',
      },
    ]);
  });

  it('MEI opt-in masks the legal name', () => {
    const r = sanitizeOpenCnpjCompany(
      { ...raw, opcao_mei: 'S', data_opcao_mei: '2020-01-01', data_exclusao_mei: '' },
      BB,
      fetchedAt,
    );
    expect(r.ok && r.value).toMatchObject({
      displayLegalName: MASKED_LEGAL_NAME,
      displayTradeName: null,
      masked: true,
      size: 'MEI',
      mei: { optedIn: true, since: '2020-01-01', excludedAt: null },
    });
  });
});

describe('CNPJá specifics', () => {
  const raw = fixture('cnpja');

  it('Simples opt-in date from `since`; no exclusion date on the open tier', () => {
    const company = clone(raw.company) as Record<string, unknown>;
    const r = sanitizeCnpjaCompany(
      {
        ...raw,
        company: {
          ...company,
          size: { id: 3, acronym: 'EPP', text: 'Empresa de Pequeno Porte' },
          simples: { optant: true, since: '2010-09-10' },
        },
      },
      BB,
      fetchedAt,
    );
    expect(r.ok && r.value.simples).toEqual({
      optedIn: true,
      since: '2010-09-10',
      excludedAt: null,
    });
    expect(r.ok && r.value.size).toBe('EPP');
    expect(r.ok && r.value.ibgeMunicipality).toBe('5300108');
  });

  it('an EI legal nature masks the name; members are never read', () => {
    const company = clone(raw.company) as Record<string, unknown>;
    const r = sanitizeCnpjaCompany(
      {
        ...raw,
        company: {
          ...company,
          name: partner,
          nature: { id: 2135, text: 'Empresário (Individual)' },
          members: [{ person: { name: partner, taxId: CPF } }],
        },
      },
      BB,
      fetchedAt,
    );
    expect(r.ok && r.value.masked).toBe(true);
    expect(JSON.stringify(r)).not.toContain(partner);
  });
});

describe('minhareceita specifics', () => {
  it('same JSON as BrasilAPI, with the tax-regime history', () => {
    const r = sanitizeMinhaReceitaCompany(
      {
        ...fixture('minhareceita'),
        regime_tributario: [{ ano: 2024, forma_de_tributacao: 'LUCRO REAL' }],
      },
      BB,
      fetchedAt,
    );
    expect(r.ok && r.value.source).toBe('minhareceita');
    expect(r.ok && r.value.ibgeMunicipality).toBe('5300108');
    expect(r.ok && r.value.taxRegimeHistory).toEqual([{ year: 2024, form: 'LUCRO REAL' }]);
  });
});

describe('ReceitaWS specifics', () => {
  const raw = fixture('receitaws');

  it('DD/MM/YYYY dates and the "203-8 - …" legal nature', () => {
    const r = sanitizeReceitaWsCompany(
      {
        ...raw,
        porte: 'EMPRESA DE PEQUENO PORTE',
        simples: { optante: true, data_opcao: '10/09/2010', data_exclusao: null },
      },
      BB,
      fetchedAt,
    );
    expect(r.ok && r.value).toMatchObject({
      legalNature: { code: '2038', description: 'Sociedade de Economia Mista' },
      activityStartDate: '1966-08-01',
      size: 'EPP',
      simples: { optedIn: true, since: '2010-09-10', excludedAt: null },
      ibgeMunicipality: null,
    });
  });

  it('a placeholder secondary CNAE (00.00-0-00) is dropped', () => {
    const r = sanitizeReceitaWsCompany(
      { ...raw, atividades_secundarias: [{ code: '00.00-0-00', text: 'Não informada' }] },
      BB,
      fetchedAt,
    );
    expect(r.ok && r.value.secondaryCnaes).toEqual([]);
  });

  it.each([
    ['CNPJ rejeitado pela Receita Federal', 'NOT_FOUND'],
    ['CNPJ inválido', 'NOT_FOUND'],
    ['Too many requests, please try again later.', 'RATE_LIMITED'],
    ['Algo deu errado', 'UNEXPECTED_RESPONSE'],
  ] as const)('HTTP 200 with status ERROR "%s" → %s', (message, code) => {
    const r = sanitizeReceitaWsCompany({ status: 'ERROR', message }, BB, fetchedAt);
    expect(r).toMatchObject({ ok: false, error: { code, source: 'receitaws' } });
  });
});

import { describe, expect, it } from 'vitest';
import {
  type Cnpj,
  detectPii,
  formatCnae,
  MASKED_LEGAL_NAME,
  parsePublicCompany,
  publicCompanySchema,
  sanitizationOf,
  sanitizeBrasilApiCompany,
  sanitizeCnpjWsCompany,
} from '../src/index.ts';
import { CPF, cnpjFrom, formatCpf, NUMERIC_CNPJ, PERSONAL_EMAIL, PHONE } from './helpers.ts';

const OTHER_CNPJ = cnpjFrom('RFOTHER00001');

const cnpj = NUMERIC_CNPJ as Cnpj;
const fetchedAt = '2026-11-17T12:00:00.000Z';
const partnerName = 'MARIA DAS DORES PEREIRA';

/** Realistic BrasilAPI payload (same keys as a live response), with QSA, address, phones and e-mail. */
function brasilApi(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cnpj: NUMERIC_CNPJ,
    uf: 'SP',
    cep: '01310100',
    qsa: [
      {
        pais: null,
        nome_socio: partnerName,
        codigo_pais: null,
        faixa_etaria: 'Entre 31 a 40 anos',
        cnpj_cpf_do_socio: `***${CPF.slice(3, 9)}**`,
        qualificacao_socio: 'Sócio-Administrador',
        nome_representante_legal: '',
        cpf_representante_legal: '***000000**',
      },
    ],
    email: PERSONAL_EMAIL,
    porte: 'EMPRESA DE PEQUENO PORTE',
    bairro: 'BELA VISTA',
    numero: '1000',
    ddd_fax: '',
    municipio: 'SAO PAULO',
    logradouro: 'PAULISTA',
    cnae_fiscal: 6201501,
    codigo_pais: null,
    complemento: 'CONJ 1',
    codigo_porte: 3,
    razao_social: 'ACME SOFTWARE LTDA',
    nome_fantasia: 'ACME',
    capital_social: 10000,
    ddd_telefone_1: PHONE,
    ddd_telefone_2: '',
    opcao_pelo_mei: false,
    codigo_municipio: 7107,
    cnaes_secundarios: [{ codigo: 0, descricao: '' }],
    natureza_juridica: 'Sociedade Empresária Limitada',
    regime_tributario: [
      {
        ano: 2024,
        cnpj_da_scp: null,
        forma_de_tributacao: 'SIMPLES NACIONAL',
        quantidade_de_escrituracoes: 1,
      },
    ],
    situacao_especial: '',
    opcao_pelo_simples: true,
    situacao_cadastral: 2,
    data_opcao_pelo_mei: '2019-03-11',
    data_exclusao_do_mei: '2019-03-11',
    cnae_fiscal_descricao: 'Desenvolvimento de programas de computador sob encomenda',
    codigo_municipio_ibge: 3550308,
    data_inicio_atividade: '2019-03-11',
    data_opcao_pelo_simples: '2019-03-11',
    nome_cidade_no_exterior: '',
    codigo_natureza_juridica: 2062,
    data_exclusao_do_simples: null,
    motivo_situacao_cadastral: 0,
    ente_federativo_responsavel: '',
    identificador_matriz_filial: 1,
    descricao_situacao_cadastral: 'ATIVA',
    ...overrides,
  };
}

function cnpjWs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cnpj_raiz: NUMERIC_CNPJ.slice(0, 8),
    razao_social: 'ACME SOFTWARE LTDA',
    capital_social: '10000.00',
    porte: { id: '03', descricao: 'Empresa de Pequeno Porte' },
    natureza_juridica: { id: '2062', descricao: 'Sociedade Empresária Limitada' },
    socios: [{ nome: partnerName, cpf_cnpj_socio: `***${CPF.slice(3, 9)}**` }],
    simples: {
      simples: 'Sim',
      data_opcao_simples: '2019-03-11',
      data_exclusao_simples: null,
      mei: 'Não',
      data_opcao_mei: '2019-03-11',
      data_exclusao_mei: '2019-03-11',
    },
    estabelecimento: {
      cnpj: NUMERIC_CNPJ,
      nome_fantasia: 'ACME',
      situacao_cadastral: 'Ativa',
      data_inicio_atividade: '2019-03-11',
      logradouro: 'PAULISTA',
      cep: '01310100',
      ddd1: '11',
      telefone1: PHONE.slice(2),
      email: PERSONAL_EMAIL,
      atividade_principal: {
        id: '6201501',
        subclasse: '6201-5/01',
        descricao: 'Desenvolvimento de programas de computador sob encomenda',
      },
      atividades_secundarias: [
        { id: '6202300', subclasse: '6202-3/00', descricao: 'Customização' },
      ],
      estado: { sigla: 'SP' },
      cidade: { ibge_id: 3550308 },
      inscricoes_estaduais: [],
    },
    ...overrides,
  };
}

describe('BrasilAPI whitelist (cnpj@1)', () => {
  it('builds the PublicCompany field by field and drops QSA, address, phones and e-mail', () => {
    const r = sanitizeBrasilApiCompany(brasilApi(), cnpj, fetchedAt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      cnpj,
      displayLegalName: 'ACME SOFTWARE LTDA',
      displayTradeName: 'ACME',
      masked: false,
      legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
      size: 'EPP',
      primaryCnae: {
        code: '6201-5/01',
        description: 'Desenvolvimento de programas de computador sob encomenda',
      },
      secondaryCnaes: [],
      registrationStatus: 'ATIVA',
      activityStartDate: '2019-03-11',
      uf: 'SP',
      ibgeMunicipality: '3550308',
      simples: { optedIn: true, since: '2019-03-11', excludedAt: null },
      mei: { optedIn: false, since: null, excludedAt: null },
      taxRegimeHistory: [{ year: 2024, form: 'SIMPLES NACIONAL' }],
      source: 'brasilapi',
      fetchedAt,
    });
    const json = JSON.stringify(r.value);
    for (const leak of [partnerName, PERSONAL_EMAIL, PHONE, 'PAULISTA', '01310100', 'qsa']) {
      expect(json).not.toContain(leak);
    }
    expect(publicCompanySchema.safeParse(r.value).success).toBe(true);
    expect(detectPii(r.value)).toEqual([]);
  });

  it('records which raw fields were discarded', () => {
    const r = sanitizeBrasilApiCompany(brasilApi(), cnpj, fetchedAt);
    if (!r.ok) throw new Error('expected ok');
    const info = sanitizationOf(r.value);
    expect(info?.whitelist).toBe('cnpj@1');
    expect(info?.discardedFields).toEqual(
      expect.arrayContaining([
        'qsa',
        'logradouro',
        'ddd_telefone_1',
        'email',
        'cep',
        'capital_social',
      ]),
    );
    expect(info?.discardedFields).not.toContain('razao_social');
  });

  it.each([
    ['2135', false],
    ['2305', false],
    ['4014', false],
    ['2062', true],
  ])('legal nature %s with MEI → masked legal name', (nature, meiOptedIn) => {
    const r = sanitizeBrasilApiCompany(
      brasilApi({
        codigo_natureza_juridica: Number(nature),
        opcao_pelo_mei: meiOptedIn,
        razao_social: `JOAO DA SILVA ${CPF}`,
        nome_fantasia: 'JOAO DOCES',
      }),
      cnpj,
      fetchedAt,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.displayLegalName).toBe(MASKED_LEGAL_NAME);
    expect(r.value.displayTradeName).toBeNull();
    expect(r.value.masked).toBe(true);
    expect(JSON.stringify(r.value)).not.toContain('JOAO');
  });

  // Code review 14/11 (LOW): masking must not fail open.
  it.each([['213-5'], [' 2135 '], ['2321'], ['4120']])(
    'legal nature %s is normalised to digits and masked',
    (nature) => {
      const r = sanitizeBrasilApiCompany(
        brasilApi({ codigo_natureza_juridica: nature, razao_social: 'JOAO DA SILVA' }),
        cnpj,
        fetchedAt,
      );
      if (!r.ok) throw new Error('expected ok');
      expect(r.value.legalNature.code).toMatch(/^\d{4}$/);
      expect(r.value).toMatchObject({
        masked: true,
        displayLegalName: MASKED_LEGAL_NAME,
        displayTradeName: null,
      });
    },
  );

  it('a company read back (cache, fixture) is re-masked when EI/MEI, whatever its masked flag says', () => {
    const r = sanitizeBrasilApiCompany(brasilApi(), cnpj, fetchedAt);
    if (!r.ok) throw new Error('expected ok');
    const leakedEi = {
      ...r.value,
      legalNature: { code: '2135', description: 'Empresário (Individual)' },
      displayLegalName: 'JOAO DA SILVA',
      displayTradeName: 'JOAO DOCES',
      masked: false,
    };
    expect(parsePublicCompany(leakedEi)).toMatchObject({
      masked: true,
      displayLegalName: MASKED_LEGAL_NAME,
      displayTradeName: null,
    });
    const leakedMei = {
      ...r.value,
      mei: { optedIn: true, since: '2020-01-01', excludedAt: null },
      masked: false,
    };
    expect(parsePublicCompany(leakedMei)?.masked).toBe(true);
    expect(parsePublicCompany(r.value)).toEqual(r.value);
  });

  it('MEI opt-in sets size MEI and keeps its dates', () => {
    const r = sanitizeBrasilApiCompany(
      brasilApi({
        opcao_pelo_mei: true,
        data_opcao_pelo_mei: '2020-01-01',
        data_exclusao_do_mei: '',
      }),
      cnpj,
      fetchedAt,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.size).toBe('MEI');
    expect(r.value.mei).toEqual({ optedIn: true, since: '2020-01-01', excludedAt: null });
  });

  it('opt-in date equal to the exclusion date with a false boolean → never opted (research 03 §2.1)', () => {
    const r = sanitizeBrasilApiCompany(
      brasilApi({
        opcao_pelo_simples: false,
        data_opcao_pelo_simples: '2007-07-01',
        data_exclusao_do_simples: '2007-07-01',
      }),
      cnpj,
      fetchedAt,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.simples).toEqual({ optedIn: false, since: null, excludedAt: null });
  });

  it('keeps a real exclusion (different dates)', () => {
    const r = sanitizeBrasilApiCompany(
      brasilApi({
        opcao_pelo_simples: false,
        data_opcao_pelo_simples: '2019-03-11',
        data_exclusao_do_simples: '2023-12-31',
      }),
      cnpj,
      fetchedAt,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.simples).toEqual({
      optedIn: false,
      since: '2019-03-11',
      excludedAt: '2023-12-31',
    });
  });

  it('strips CPFs from kept strings and maps size codes and texts', () => {
    const r = sanitizeBrasilApiCompany(
      brasilApi({
        nome_fantasia: `LOJA ${formatCpf(CPF)}`,
        codigo_porte: null,
        porte: 'MICRO EMPRESA',
      }),
      cnpj,
      fetchedAt,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.displayTradeName).toBe('LOJA [doc]');
    expect(r.value.size).toBe('ME');
    for (const [code, porte, size] of [
      [5, '', 'OTHER'],
      [null, 'DEMAIS', 'OTHER'],
      [null, 'EMPRESA DE PEQUENO PORTE', 'EPP'],
      [null, null, 'UNKNOWN'],
    ] as const) {
      const s = sanitizeBrasilApiCompany(brasilApi({ codigo_porte: code, porte }), cnpj, fetchedAt);
      expect(s.ok && s.value.size).toBe(size);
    }
  });

  it('keeps valid secondary CNAEs and tolerates missing optional blocks', () => {
    const r = sanitizeBrasilApiCompany(
      brasilApi({
        cnaes_secundarios: [{ codigo: 6202300, descricao: 'Customização' }],
        regime_tributario: null,
        nome_fantasia: '',
        codigo_municipio_ibge: null,
        opcao_pelo_simples: null,
      }),
      cnpj,
      fetchedAt,
    );
    if (!r.ok) throw new Error('expected ok');
    expect(r.value.secondaryCnaes).toEqual([{ code: '6202-3/00', description: 'Customização' }]);
    expect(r.value.taxRegimeHistory).toEqual([]);
    expect(r.value.displayTradeName).toBeNull();
    expect(r.value.ibgeMunicipality).toBeNull();
    expect(r.value.simples.optedIn).toBe(false);
  });

  it.each([
    ['not an object', null],
    ['another CNPJ', brasilApi({ cnpj: OTHER_CNPJ })],
    ['no start date', brasilApi({ data_inicio_atividade: '' })],
    ['impossible date', brasilApi({ data_inicio_atividade: '2019-02-30' })],
    ['no primary CNAE', brasilApi({ cnae_fiscal: null })],
    ['wrong types', brasilApi({ opcao_pelo_mei: 'sim' })],
  ])('%s → UNEXPECTED_RESPONSE, never throws', (_label, raw) => {
    const r = sanitizeBrasilApiCompany(raw, cnpj, fetchedAt);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: 'UNEXPECTED_RESPONSE', source: 'brasilapi' });
  });
});

describe('CNPJ.ws whitelist (cnpj@1)', () => {
  it('produces the same company and drops socios, address and contacts', () => {
    const r = sanitizeCnpjWsCompany(cnpjWs(), cnpj, fetchedAt);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      displayLegalName: 'ACME SOFTWARE LTDA',
      displayTradeName: 'ACME',
      size: 'EPP',
      legalNature: { code: '2062' },
      primaryCnae: { code: '6201-5/01' },
      secondaryCnaes: [{ code: '6202-3/00', description: 'Customização' }],
      registrationStatus: 'ATIVA',
      uf: 'SP',
      ibgeMunicipality: '3550308',
      simples: { optedIn: true, since: '2019-03-11', excludedAt: null },
      mei: { optedIn: false, since: null, excludedAt: null },
      taxRegimeHistory: [],
      source: 'cnpjws',
    });
    const json = JSON.stringify(r.value);
    for (const leak of [partnerName, PERSONAL_EMAIL, 'PAULISTA', 'socios']) {
      expect(json).not.toContain(leak);
    }
    expect(sanitizationOf(r.value)?.discardedFields).toEqual(
      expect.arrayContaining([
        'socios',
        'capital_social',
        'estabelecimento.email',
        'estabelecimento.logradouro',
      ]),
    );
  });

  it('MEI "Sim" masks the legal name; missing simples block means not opted', () => {
    const mei = sanitizeCnpjWsCompany(
      cnpjWs({ simples: { mei: 'Sim', simples: 'Sim', data_opcao_mei: '2021-01-01' } }),
      cnpj,
      fetchedAt,
    );
    expect(mei.ok && mei.value.masked && mei.value.size).toBe('MEI');
    const none = sanitizeCnpjWsCompany(cnpjWs({ simples: null, porte: null }), cnpj, fetchedAt);
    if (!none.ok) throw new Error('expected ok');
    expect(none.value.simples).toEqual({ optedIn: false, since: null, excludedAt: null });
    expect(none.value.size).toBe('UNKNOWN');
  });

  it('rejects a malformed or mismatched payload', () => {
    expect(sanitizeCnpjWsCompany({}, cnpj, fetchedAt).ok).toBe(false);
    const other = cnpjWs();
    (other.estabelecimento as Record<string, unknown>).cnpj = OTHER_CNPJ;
    expect(sanitizeCnpjWsCompany(other, cnpj, fetchedAt).ok).toBe(false);
  });
});

describe('formatCnae', () => {
  it.each([
    [6201501, '6201-5/01'],
    ['6201-5/01', '6201-5/01'],
    [111301, '0111-3/01'],
    [0, null],
    ['', null],
    [null, null],
    ['123456789', null],
  ])('%s → %s', (input, expected) => {
    expect(formatCnae(input)).toBe(expected);
  });
});

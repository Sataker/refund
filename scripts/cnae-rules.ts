// Legal rules of the CNAE → Simples Nacional anexo table (decision D50, PLAN §18; ENGINE-SPEC E.4). Data only: the
// generator (scripts/build-cnae-table.ts) applies them to the IBGE subclass list. Every rule names the provision it
// comes from, and every provision carries a verbatim quote that the generator finds in the capture before writing a
// row (LC 123/2006 from Planalto, Res. CGSN 140/2018 from the Receita API). Precedence and doubt: a CNAE whose anexo
// depends on facts we do not have is `ambiguous`, never `verified` (CLAUDE.md rule 12).

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V';
export type Capture = 'lc123' | 'res140';

export interface Provision {
  /** Citation as it appears in `source`. */
  label: string;
  /** Verbatim excerpt of the capture (compared without whitespace). */
  quote: string;
  capture: Capture;
  /** @refund/law ids, when the corpus has the provision (CLAUDE.md rule 3). */
  refs?: readonly string[];
}

const lc = (label: string, quote: string, refs?: readonly string[]): Provision => ({
  label: `LC 123/2006, ${label}`,
  quote,
  capture: 'lc123',
  ...(refs === undefined ? {} : { refs }),
});
const res = (label: string, quote: string): Provision => ({
  label: `Res. CGSN 140/2018, ${label}`,
  quote,
  capture: 'res140',
});

const P5C = ['lc123-2006/art18/p5-c'] as const;
const P5D = ['lc123-2006/art18/p5-d'] as const;
const P5I = ['lc123-2006/art18/p5-i'] as const;

export const PROVISIONS = {
  art17x: lc(
    'art. 17, X',
    'X - que exerça atividade de produção ou venda no atacado de: a) cigarros, cigarrilhas, charutos, filtros para cigarros, armas de fogo, munições e pólvoras, explosivos e detonantes;',
  ),
  art17xb: lc('art. 17, X, "b", 4', '4 - cervejas sem álcool;'),
  art17xc: lc(
    'art. 17, X, "c"',
    'c) bebidas alcoólicas, exceto aquelas produzidas ou vendidas no atacado por:',
  ),
  art17i: lc(
    'art. 17, I',
    'gerenciamento de ativos (asset management) ou compra de direitos creditórios resultantes de vendas mercantis a prazo ou de prestação de serviços (factoring)',
  ),
  art17vi: lc(
    'art. 17, VI',
    'VI - que preste serviço de transporte intermunicipal e interestadual de passageiros, exceto quando na modalidade fluvial ou quando possuir características de transporte urbano ou metropolitano',
  ),
  art17viii: lc(
    'art. 17, VIII',
    'VIII - que exerça atividade de importação ou fabricação de automóveis e motocicletas;',
  ),
  art17xii: lc('art. 17, XII', 'XII - que realize cessão ou locação de mão-de-obra;'),
  art17xv: lc('art. 17, XV', 'XV - que realize atividade de locação de imóveis próprios;'),
  p4i: lc(
    'art. 18, § 4º, I',
    'I - revenda de mercadorias, que serão tributadas na forma do Anexo I desta Lei Complementar;',
  ),
  p4ii: lc(
    'art. 18, § 4º, II',
    'II - venda de mercadorias industrializadas pelo contribuinte, que serão tributadas na forma do Anexo II desta Lei Complementar;',
  ),
  p4iii: lc(
    'art. 18, § 4º, III',
    'III - prestação de serviços de que trata o § 5o-B deste artigo e dos serviços vinculados à locação de bens imóveis e corretagem de imóveis',
  ),
  p4v: lc(
    'art. 18, § 4º, V',
    'V - locação de bens móveis, que serão tributadas na forma do Anexo III desta Lei Complementar, deduzida a parcela correspondente ao ISS;',
  ),
  p4vi: lc(
    'art. 18, § 4º, VI',
    'VI - atividade com incidência simultânea de IPI e de ISS, que serão tributadas na forma do Anexo II desta Lei Complementar, deduzida a parcela correspondente ao ICMS e acrescida a parcela correspondente ao ISS',
  ),
  p4vii: lc(
    'art. 18, § 4º, VII',
    'VII - comercialização de medicamentos e produtos magistrais produzidos por manipulação de fórmulas:',
  ),
  p5: lc(
    'art. 18, § 5º',
    '§ 5º As atividades industriais serão tributadas na forma do Anexo II desta Lei Complementar',
  ),
  p5bI: lc(
    'art. 18, § 5º-B, I',
    'I - creche, pré-escola e estabelecimento de ensino fundamental, escolas técnicas, profissionais e de ensino médio, de línguas estrangeiras, de artes, cursos técnicos de pilotagem, preparatórios para concursos, gerenciais e escolas livres, exceto as previstas nos incisos II e III do § 5º-D deste artigo;',
  ),
  p5bII: lc('art. 18, § 5º-B, II', 'II - agência terceirizada de correios;'),
  p5bIII: lc('art. 18, § 5º-B, III', 'III - agência de viagem e turismo;'),
  p5bIV: lc(
    'art. 18, § 5º-B, IV',
    'IV - centro de formação de condutores de veículos automotores de transporte terrestre de passageiros e de carga;',
  ),
  p5bV: lc('art. 18, § 5º-B, V', 'V - agência lotérica;'),
  p5bIX: lc(
    'art. 18, § 5º-B, IX',
    'IX - serviços de instalação, de reparos e de manutenção em geral, bem como de usinagem, solda, tratamento e revestimento em metais;',
  ),
  p5bXIII: lc('art. 18, § 5º-B, XIII', 'XIII - transporte municipal de passageiros;'),
  p5bXIV: lc(
    'art. 18, § 5º-B, XIV',
    'XIV - escritórios de serviços contábeis, observado o disposto nos §§ 22-B e 22-C deste artigo.',
  ),
  p5bXV: lc(
    'art. 18, § 5º-B, XV',
    'XV - produções cinematográficas, audiovisuais, artísticas e culturais, sua exibição ou apresentação, inclusive no caso de música, literatura, artes cênicas, artes visuais, cinematográficas e audiovisuais.',
  ),
  p5bXVI: lc('art. 18, § 5º-B, XVI', 'XVI - fisioterapia;'),
  p5bXVII: lc('art. 18, § 5º-B, XVII', 'XVII - corretagem de seguros.'),
  p5bXVIII: lc('art. 18, § 5º-B, XVIII', 'XVIII - arquitetura e urbanismo;'),
  p5bXIX: lc('art. 18, § 5º-B, XIX', 'XIX - medicina, inclusive laboratorial, e enfermagem;'),
  p5bXX: lc('art. 18, § 5º-B, XX', 'XX - odontologia e prótese dentária;'),
  p5bXXI: lc(
    'art. 18, § 5º-B, XXI',
    'XXI - psicologia, psicanálise, terapia ocupacional, acupuntura, podologia, fonoaudiologia, clínicas de nutrição e de vacinação e bancos de leite.',
  ),
  p5cI: lc(
    'art. 18, § 5º-C, I',
    'I - construção de imóveis e obras de engenharia em geral, inclusive sob a forma de subempreitada, execução de projetos e serviços de paisagismo, bem como decoração de interiores;',
    P5C,
  ),
  p5cVI: lc('art. 18, § 5º-C, VI', 'VI - serviço de vigilância, limpeza ou conservação.', P5C),
  p5cVII: lc('art. 18, § 5º-C, VII', 'VII - serviços advocatícios.', P5C),
  p5dI: lc('art. 18, § 5º-D, I', 'I - administração e locação de imóveis de terceiros;', P5D),
  p5dII: lc(
    'art. 18, § 5º-D, II',
    'II - academias de dança, de capoeira, de ioga e de artes marciais;',
    P5D,
  ),
  p5dIII: lc(
    'art. 18, § 5º-D, III',
    'III - academias de atividades físicas, desportivas, de natação e escolas de esportes;',
    P5D,
  ),
  p5dIV: lc(
    'art. 18, § 5º-D, IV',
    'IV - elaboração de programas de computadores, inclusive jogos eletrônicos, desde que desenvolvidos em estabelecimento do optante;',
    P5D,
  ),
  p5dV: lc(
    'art. 18, § 5º-D, V',
    'V - licenciamento ou cessão de direito de uso de programas de computação;',
    P5D,
  ),
  p5dXII: lc(
    'art. 18, § 5º-D, XII',
    'XII - laboratórios de análises clínicas ou de patologia clínica;',
    P5D,
  ),
  p5dXIII: lc(
    'art. 18, § 5º-D, XIII',
    'XIII - serviços de tomografia, diagnósticos médicos por imagem, registros gráficos e métodos óticos, bem como ressonância magnética;',
    P5D,
  ),
  p5e: lc(
    'art. 18, § 5º-E',
    'as atividades de prestação de serviços de comunicação e de transportes interestadual e intermunicipal de cargas, e de transportes autorizados no inciso VI do caput do art. 17, inclusive na modalidade fluvial, serão tributadas na forma do Anexo III, deduzida a parcela correspondente ao ISS e acrescida a parcela correspondente ao ICMS prevista no Anexo I.',
  ),
  p5f: lc(
    'art. 18, § 5º-F',
    'As atividades de prestação de serviços referidas no § 2o do art. 17 desta Lei Complementar serão tributadas na forma do Anexo III desta Lei Complementar, salvo se, para alguma dessas atividades, houver previsão expressa de tributação na forma dos Anexos IV ou V desta Lei Complementar.',
  ),
  p5iII: lc('art. 18, § 5º-I, II', 'II - medicina veterinária;', P5I),
  p5iV: lc(
    'art. 18, § 5º-I, V',
    'V - serviços de comissaria, de despachantes, de tradução e de interpretação;',
    P5I,
  ),
  p5iVI: lc(
    'art. 18, § 5º-I, VI',
    'VI - engenharia, medição, cartografia, topografia, geologia, geodésia, testes, suporte e análises técnicas e tecnológicas, pesquisa, design, desenho e agronomia;',
    P5I,
  ),
  p5iVII: lc(
    'art. 18, § 5º-I, VII',
    'VII - representação comercial e demais atividades de intermediação de negócios e serviços de terceiros;',
    P5I,
  ),
  p5iVIII: lc('art. 18, § 5º-I, VIII', 'VIII - perícia, leilão e avaliação;', P5I),
  p5iIX: lc(
    'art. 18, § 5º-I, IX',
    'IX - auditoria, economia, consultoria, gestão, organização, controle e administração;',
    P5I,
  ),
  p5iX: lc('art. 18, § 5º-I, X', 'X - jornalismo e publicidade;', P5I),
  p5iXI: lc('art. 18, § 5º-I, XI', 'XI - agenciamento, exceto de mão de obra;', P5I),
  p5iXII: lc(
    'art. 18, § 5º-I, XII',
    'XII - outras atividades do setor de serviços que tenham por finalidade a prestação de serviços decorrentes do exercício de atividade intelectual, de natureza técnica, científica, desportiva, artística ou cultural, que constitua profissão regulamentada ou não, desde que não sujeitas à tributação na forma dos Anexos III ou IV desta Lei Complementar.',
    P5I,
  ),
  p5j: lc(
    'art. 18, § 5º-J',
    'As atividades de prestação de serviços a que se refere o § 5o-I serão tributadas na forma do Anexo III desta Lei Complementar caso a razão entre a folha de salários e a receita bruta da pessoa jurídica seja igual ou superior a 28% (vinte e oito por cento).',
    ['lc123-2006/art18/p5-j'],
  ),
  p5mI: lc(
    'art. 18, § 5º-M, I',
    'I - nos incisos XVI, XVIII, XIX, XX e XXI do § 5o-B deste artigo;',
    ['lc123-2006/art18/p5-m'],
  ),
  p5mII: lc('art. 18, § 5º-M, II', 'II - no § 5o-D deste artigo.', ['lc123-2006/art18/p5-m']),
  r8p1: res(
    'art. 8º, § 1º, e Anexo VI',
    '§ 1º O Anexo VI relaciona códigos da CNAE correspondentes a atividades impeditivas do ingresso no Simples Nacional.',
  ),
  r8p2: res(
    'art. 8º, § 2º, e Anexo VII',
    '§ 2º O Anexo VII relaciona códigos ambíguos da CNAE, ou seja, os que abrangem concomitantemente atividade impeditiva e permitida ao ingresso no Simples Nacional.',
  ),
  r25IIId: res(
    'art. 25, § 1º, III, "d"',
    'd) transporte municipal de passageiros e de cargas em qualquer modalidade;',
  ),
  r25IIIj: res(
    'art. 25, § 1º, III, "j"',
    'j) corretagem de imóveis de terceiros, assim entendida a intermediação na compra, venda, permuta e locação de imóveis;',
  ),
  r25IIIm: res(
    'art. 25, § 1º, III, "m"',
    '1. não tenham por finalidade a prestação de serviços decorrentes do exercício de atividade intelectual, de natureza técnica, científica, desportiva, artística ou cultural, que constitua profissão regulamentada ou não; e',
  ),
  r25VIII: res(
    'art. 25, § 1º, VIII',
    'VIII - prestação do serviço de escritórios de serviços contábeis, que serão tributados na forma do Anexo III, desconsiderando-se o percentual relativo ao ISS, quando o imposto for fixado pela legislação municipal e recolhido diretamente ao Município em valor fixo',
  ),
  r25p5: res(
    'art. 25, § 5º',
    '§ 5º A receita decorrente da locação de bens móveis, referida no inciso VI do § 1º, é tão-somente aquela oriunda da exploração de atividade não definida na lista de serviços anexa à Lei Complementar nº 116, de 2003.',
  ),
  r25p16: res('art. 25, § 16', '§ 16. A receita auferida na venda de veículos em consignação:'),
} as const satisfies Record<string, Provision>;

export type ProvisionKey = keyof typeof PROVISIONS;

/** How the DAS of a verified anexo differs from the plain table (the engine computes none of these). */
export type AnexoAdjustment = 'without_iss' | 'without_iss_with_icms';

export interface VerifiedRule {
  anexo: Anexo;
  fatorR: boolean;
  /** First the provision that fixes the anexo, then the Fator R one when it applies. */
  provisions: readonly ProvisionKey[];
  adjustment?: AnexoAdjustment;
}

const v = (
  anexo: Anexo,
  provisions: readonly ProvisionKey[],
  extra: { fatorR?: boolean; adjustment?: AnexoAdjustment } = {},
): VerifiedRule => ({
  anexo,
  fatorR: extra.fatorR ?? false,
  provisions,
  ...(extra.adjustment === undefined ? {} : { adjustment: extra.adjustment }),
});
/** § 5º-B items under the Fator R (§ 5º-M, I): Anexo III at 28% or more, V below. */
const bFr = (p: ProvisionKey) => v('III', [p, 'p5mI'], { fatorR: true });
/** § 5º-D items: Anexo III, V below a Fator R of 28% (§ 5º-M, II). */
const dFr = (p: ProvisionKey) => v('III', [p, 'p5mII'], { fatorR: true });
/** § 5º-I items: Anexo V, III at a Fator R of 28% or more (§ 5º-J). */
const iFr = (p: ProvisionKey) => v('V', [p, 'p5j'], { fatorR: true });
const each = <T>(codes: readonly string[], rule: T): Record<string, T> =>
  Object.fromEntries(codes.map((c) => [c, rule]));

/** Services whose anexo a provision fixes by name. A code appears once; the generator refuses duplicates. */
export const VERIFIED_SERVICES: Readonly<Record<string, VerifiedRule>> = {
  // § 5º-B, I: education (the § 5º-D, II–III exceptions, dance and sports schools, are below).
  ...each(['8511-2/00', '8512-1/00', '8513-9/00', '8520-1/00', '8541-4/00'], v('III', ['p5bI'])),
  ...each(['8593-7/00', '8592-9/02', '8592-9/03'], v('III', ['p5bI'])),
  ...each(['8599-6/02', '8599-6/03', '8599-6/04', '8599-6/05'], v('III', ['p5bI'])),
  '8599-6/01': v('III', ['p5bIV']),
  '5310-5/02': v('III', ['p5bII']),
  '7911-2/00': v('III', ['p5bIII']),
  '8299-7/06': v('III', ['p5bV']),
  // § 5º-B, IX: installation, repair and maintenance; machining, welding, metal treatment.
  ...each(['2539-0/01', '2539-0/02'], v('III', ['p5bIX'])),
  ...each(
    [
      '4520-0/01',
      '4520-0/02',
      '4520-0/03',
      '4520-0/04',
      '4520-0/06',
      '4520-0/07',
      '4543-9/00',
      '3321-0/00',
      '3329-5/99',
      '9511-8/00',
      '9512-6/00',
      '9521-5/00',
      '9529-1/01',
      '9529-1/03',
      '9529-1/04',
      '9529-1/05',
      '9529-1/06',
      '9529-1/99',
    ],
    v('III', ['p5bIX']),
  ),
  // § 5º-B, XIII (passengers) and Res. CGSN 140, art. 25, § 1º, III, "d" (passengers and cargo), municipal only.
  ...each(['4921-3/01', '4929-9/01', '4929-9/03', '5022-0/01', '5091-2/01'], v('III', ['p5bXIII'])),
  ...each(['4930-2/01', '5021-1/01'], v('III', ['r25IIId'])),
  // § 5º-B, XV: cinema, audiovisual, artistic and cultural productions and their exhibition.
  ...each(
    ['5911-1/01', '5911-1/99', '5914-6/00', '9001-9/01', '9001-9/02', '9001-9/03', '9001-9/04'],
    v('III', ['p5bXV']),
  ),
  // § 4º, III and Res. CGSN 140, art. 25, § 1º, III, "j": brokerage of third-party property rentals.
  '6821-8/02': v('III', ['p4iii', 'r25IIIj']),
  // § 5º-B, XVI, XVIII–XXI with the Fator R (§ 5º-M, I).
  '8650-0/04': bFr('p5bXVI'),
  '7111-1/00': bFr('p5bXVIII'),
  ...Object.fromEntries(
    [
      '8630-5/01',
      '8630-5/02',
      '8630-5/03',
      '8630-5/07',
      '8640-2/01',
      '8640-2/03',
      '8640-2/10',
      '8640-2/11',
      '8640-2/12',
      '8640-2/13',
      '8650-0/01',
    ].map((c) => [c, bFr('p5bXIX')]),
  ),
  '3250-7/06': bFr('p5bXX'),
  ...Object.fromEntries(
    [
      '8630-5/06',
      '8650-0/02',
      '8650-0/03',
      '8650-0/05',
      '8650-0/06',
      '8690-9/02',
      '8690-9/03',
      '8690-9/04',
    ].map((c) => [c, bFr('p5bXXI')]),
  ),
  // § 5º-D with the Fator R (§ 5º-M, II).
  '6822-6/00': dFr('p5dI'),
  '8592-9/01': dFr('p5dII'),
  '8591-1/00': dFr('p5dIII'),
  '9313-1/00': dFr('p5dIII'),
  '6202-3/00': v('III', ['p5dIV', 'p5dV', 'p5mII'], { fatorR: true }),
  '6203-1/00': v('III', ['p5dIV', 'p5dV', 'p5mII'], { fatorR: true }),
  '8640-2/02': dFr('p5dXII'),
  ...Object.fromEntries(
    ['8640-2/04', '8640-2/05', '8640-2/06', '8640-2/07', '8640-2/08', '8640-2/09'].map((c) => [
      c,
      dFr('p5dXIII'),
    ]),
  ),
  // § 5º-I with the Fator R (§ 5º-J).
  '7500-1/00': iFr('p5iII'),
  ...Object.fromEntries(['5250-8/01', '5250-8/02', '7490-1/01'].map((c) => [c, iFr('p5iV')])),
  ...Object.fromEntries(
    [
      '7112-0/00',
      '7119-7/01',
      '7119-7/02',
      '7119-7/03',
      '7120-1/00',
      '7210-0/00',
      '7220-7/00',
      '7320-3/00',
      '7410-2/03',
      '7410-2/99',
      '7490-1/03',
    ].map((c) => [c, iFr('p5iVI')]),
  ),
  ...Object.fromEntries(
    [
      '4512-9/01',
      '4530-7/06',
      '4542-1/01',
      '4611-7/00',
      '4612-5/00',
      '4613-3/00',
      '4614-1/00',
      '4615-0/00',
      '4616-8/00',
      '4617-6/00',
      '4618-4/01',
      '4618-4/02',
      '4618-4/03',
      '4618-4/99',
      '4619-2/00',
      '7490-1/04',
    ].map((c) => [c, iFr('p5iVII')]),
  ),
  ...Object.fromEntries(['7119-7/04', '6621-5/01'].map((c) => [c, iFr('p5iVIII')])),
  ...Object.fromEntries(
    ['6204-0/00', '6920-6/02', '7020-4/00', '6621-5/02'].map((c) => [c, iFr('p5iIX')]),
  ),
  ...Object.fromEntries(['7311-4/00', '7319-0/04', '6391-7/00'].map((c) => [c, iFr('p5iX')])),
  ...Object.fromEntries(
    ['5232-0/00', '5250-8/03', '7312-2/00', '7490-1/05'].map((c) => [c, iFr('p5iXI')]),
  ),
  // § 5º-C (Anexo IV, CPP outside the DAS). Construction (division 41–43) is the general rule below.
  '8130-3/00': v('IV', ['p5cI']),
  ...each(['8011-1/01', '8121-4/00', '8129-0/00'], v('IV', ['p5cVI'])),
  '6911-7/01': v('IV', ['p5cVII']),
  // § 4º, V: rental of movable goods, Anexo III without the ISS share (Res. CGSN 140, art. 25, § 5º: only rentals
  // outside the LC 116 list; scaffolding, stages and trademarks are in that list, so they are ambiguous below).
  ...each(
    [
      '7711-0/00',
      '7719-5/01',
      '7719-5/02',
      '7719-5/99',
      '7721-7/00',
      '7722-5/00',
      '7723-3/00',
      '7729-2/01',
      '7729-2/02',
      '7729-2/03',
      '7729-2/99',
      '7731-4/00',
      '7732-2/01',
      '7733-1/00',
      '7739-0/01',
      '7739-0/02',
      '7739-0/99',
    ],
    v('III', ['p4v', 'r25p5'], { adjustment: 'without_iss' }),
  ),
  // § 5º-E: communication, Anexo III without ISS and with the ICMS share of Anexo I.
  ...each(
    [
      '6110-8/01',
      '6110-8/02',
      '6110-8/03',
      '6110-8/99',
      '6120-5/01',
      '6120-5/02',
      '6120-5/99',
      '6130-2/00',
      '6141-8/00',
      '6142-6/00',
      '6143-4/00',
    ],
    v('III', ['p5e'], { adjustment: 'without_iss_with_icms' }),
  ),
};

export interface AmbiguousRule {
  provisions: readonly ProvisionKey[];
  /** Why the anexo cannot be fixed from the CNAE alone (Portuguese, like `source`). */
  why: string;
}

const a = (provisions: readonly ProvisionKey[], why: string): AmbiguousRule => ({
  provisions,
  why,
});
const RESIDUAL = a(
  ['p5f', 'p5iXII', 'r25IIIm'],
  'serviço não listado por nome: Anexo III se não for atividade intelectual (§ 5º-F), Anexo V com Fator R se for (§ 5º-I, XII)',
);

/** CNAEs whose description itself leaves the anexo open. Checked before the general rules. */
export const AMBIGUOUS: Readonly<Record<string, AmbiguousRule>> = {
  // Commerce exceptions (division 45–47).
  ...each(
    ['4512-9/02', '4542-1/02'],
    a(
      ['r25p16', 'p4i'],
      'venda em consignação: por comissão vai ao Anexo III, por contrato estimatório ao Anexo I',
    ),
  ),
  ...each(
    ['4623-1/08', '4632-0/03', '4639-7/02', '4649-4/09'],
    a(
      ['p4i', 'p4ii'],
      'atacado com fracionamento e acondicionamento: parte revenda (Anexo I), parte industrialização (Anexo II)',
    ),
  ),
  ...each(
    ['4771-7/02', '4771-7/03'],
    a(
      ['p4vii'],
      'medicamento manipulado: Anexo III sob encomenda para entrega posterior, Anexo I nos demais casos',
    ),
  ),
  '4751-2/02': a(
    ['p4i', 'p5bIX'],
    'recarga de cartuchos: revenda (Anexo I) ou serviço (Anexo III)',
  ),
  ...each(
    ['4520-0/05', '4520-0/08'],
    a(['p5bIX', 'p5f'], 'nem todo o serviço é reparo ou manutenção (§ 5º-B, IX)'),
  ),
  // Industry (section C) exceptions.
  ...each(
    ['1111-9/01', '1111-9/02', '1112-7/00'],
    a(
      ['art17xc', 'p4ii'],
      'bebida alcoólica: só cabe no Simples a micro ou pequena destilaria ou vinícola registrada no MAPA',
    ),
  ),
  '1122-4/99': a(['art17xb', 'p4ii'], 'pode incluir cerveja sem álcool, vedada no Simples'),
  '2092-4/02': a(['art17x', 'p4ii'], 'artigo pirotécnico pode conter pólvora ou explosivo'),
  '2910-7/02': a(
    ['art17viii', 'p4ii'],
    'chassi com motor de automóvel pode ser fabricação de automóvel',
  ),
  ...each(
    ['2330-3/01', '3250-7/03'],
    a(['p4ii', 'p4vi'], 'fabricação sob encomenda pode ter ISS (industrialização por encomenda)'),
  ),
  '3250-7/09': a(['p4ii', 'p5bIX'], 'laboratório óptico: industrialização ou serviço'),
  '3329-5/01': a(['p5bIX', 'p5f'], 'montagem de móveis: instalação (Anexo III) ou outro serviço'),
  // Construction (division 41–43) exceptions: installation and maintenance can be § 5º-B, IX (III) or § 5º-C (IV).
  ...each(
    [
      '4221-9/03',
      '4221-9/05',
      '4321-5/00',
      '4322-3/01',
      '4322-3/02',
      '4322-3/03',
      '4329-1/01',
      '4329-1/02',
      '4329-1/03',
      '4329-1/04',
      '4329-1/05',
      '4329-1/99',
      '4330-4/02',
    ],
    a(
      ['p5cI', 'p5bIX'],
      'instalação ou manutenção: Anexo IV se for parte de obra, Anexo III se for serviço avulso',
    ),
  ),
  '4312-6/00': a(['p5cI', 'p5iVI'], 'sondagem pode ser obra (Anexo IV) ou geologia (Anexo V)'),
  '4399-1/01': a(['p5cI', 'p5iIX'], 'administração de obra: obra (Anexo IV) ou gestão (Anexo V)'),
  ...each(
    ['4399-1/02', '4399-1/04'],
    a(['p5cI', 'p5f'], 'fornecimento de equipamento ou estrutura com operação: obra ou locação'),
  ),
  // Services.
  '6920-6/01': a(
    ['p5bXIV', 'r25VIII'],
    'escritório contábil: ISS fixo municipal muda o cálculo do Anexo III',
  ),
  '7410-2/02': a(
    ['p5cI', 'p5iVI'],
    'design de interiores: decoração de interiores (Anexo IV) ou design (Anexo V)',
  ),
  '7319-0/01': a(
    ['p5iX', 'p5f'],
    'criação de estandes: publicidade (Anexo V) ou montagem de estande (Anexo III)',
  ),
  '6622-3/00': a(
    ['p5bXVII', 'p5iXI'],
    'corretagem de seguros é Anexo III; agenciamento de seguros, Anexo V',
  ),
  '6821-8/01': a(
    ['p4iii', 'p5iVIII'],
    'corretagem de imóveis (Anexo III) junto com avaliação (Anexo V)',
  ),
  ...each(
    ['6630-4/00', '8291-1/00'],
    a(['art17i'], 'gestão de ativos ou de crédito prestada de forma contínua é vedada no Simples'),
  ),
  '7810-8/00': a(
    ['p5iXI', 'art17xii'],
    'agenciamento de mão de obra é excluído do Anexo V e a locação de mão de obra é vedada',
  ),
  ...each(
    ['7732-2/02', '7739-0/03'],
    a(
      ['p4v', 'r25p5'],
      'cessão de andaimes e estruturas temporárias está na lista da LC 116 (item 3.05): não é locação de bem móvel',
    ),
  ),
  '7740-3/00': a(
    ['p4v', 'r25p5'],
    'cessão de marcas está na lista da LC 116 (item 3.02): não é locação de bem móvel',
  ),
  '4912-4/02': a(
    ['p5bXIII', 'p5e'],
    'municipal (Anexo III) e metropolitano (Anexo III sem ISS e com ICMS) no mesmo código',
  ),
  ...each(
    ['4922-1/03', '4930-2/02', '5021-1/02', '5022-0/02', '5091-2/02'],
    a(
      ['p5e', 'art17vi'],
      'transporte intermunicipal, interestadual ou internacional: anexo e vedação dependem da modalidade',
    ),
  ),
};

/** The reason of every CNAE no rule above or below resolves, by IBGE section (services: the residual rule). */
export const DEFAULT_AMBIGUOUS = RESIDUAL;
const GOODS = a(
  ['p4i', 'p4ii'],
  'venda de produção própria não industrializada: a LC 123 só nomeia revenda (Anexo I) e industrialização (Anexo II)',
);
export const SECTION_DEFAULT: Readonly<Record<string, AmbiguousRule>> = {
  A: GOODS,
  B: GOODS,
  D: a(
    ['p4i', 'p4ii', 'p5f'],
    'fornecimento de gás, vapor ou água quente: venda de mercadoria ou serviço conforme a operação',
  ),
  E: a(
    ['p4i', 'p4ii', 'p5f'],
    'água, esgoto, resíduos e recuperação de materiais: venda, industrialização ou serviço conforme a operação',
  ),
  I: RESIDUAL,
};
/** Food service (division 56): supply of meals is a sale of goods with ICMS, not a service of the LC 116 list. */
export const DIVISION_DEFAULT: Readonly<Record<string, AmbiguousRule>> = {
  '56': a(
    ['p4i', 'p4ii'],
    'fornecimento de alimentação: revenda (Anexo I) ou preparo próprio (Anexo II) conforme a operação',
  ),
};

/** Industry rows of section C that are Anexo II by their own wording (manufacture of the company's own goods). */
export const INDUSTRY_PREFIXES = ['FABRICAÇÃO DE ', 'CONFECÇÃO DE ', 'PRODUÇÃO DE '] as const;
/** Section C wording that points to a service or to an order from a third party: never Anexo II by default. */
export const INDUSTRY_DOUBT = ['SOB ENCOMENDA', 'SOB MEDIDA', 'SOB CONTRATO'] as const;

/** Construction (divisions 41–43): § 5º-C, I, Anexo IV, unless listed in AMBIGUOUS. */
export const CONSTRUCTION_DIVISIONS = ['41', '42', '43'] as const;
/** Commerce (divisions 45–47): § 4º, I, Anexo I, unless listed in VERIFIED_SERVICES or AMBIGUOUS. */
export const COMMERCE_DIVISIONS = ['45', '46', '47'] as const;

// ---------- Monofásico resale (ENGINE-SPEC D.6 and E.5) ----------

/** E.5 list: R06 triggers (true). Beverages (4723-7/00) are switched off there, so they are a question. */
export const MONOFASICO_E5: readonly string[] = [
  '4771-7/01',
  '4771-7/02',
  '4771-7/03',
  '4772-5/00',
  '4530-7/03',
  '4530-7/05',
  '4731-8/00',
  '4711-3/01',
  '4711-3/02',
  '4712-1/00',
];

/**
 * Commerce CNAEs whose typical goods are in a monofásico regime (Lei 10.147/2000 medicines and cosmetics; Lei
 * 10.485/2002 vehicles, auto parts and tyres; fuels; cold beverages) but are not in E.5: the spec gives no default,
 * so they are a question to the user (D50).
 */
export const MONOFASICO_QUESTION: readonly string[] = [
  // Auto parts, tyres and vehicles (Lei 10.485/2002).
  '4511-1/01',
  '4511-1/03',
  '4511-1/04',
  '4511-1/06',
  '4530-7/01',
  '4530-7/02',
  '4530-7/04',
  '4541-2/01',
  '4541-2/02',
  '4541-2/03',
  '4541-2/06',
  '4541-2/07',
  // Medicines, cosmetics, perfumery and hygiene (Lei 10.147/2000).
  '4644-3/01',
  '4644-3/02',
  '4646-0/01',
  '4646-0/02',
  '4649-4/08',
  '4649-4/09',
  '4771-7/04',
  // Mixed retail whose shelves typically carry those goods.
  '4713-0/02',
  '4713-0/04',
  '4713-0/05',
  '4729-6/02',
  // Beverages (E.5: switched off until the NCM check).
  '4635-4/01',
  '4635-4/02',
  '4635-4/03',
  '4635-4/99',
  '4723-7/00',
  // Fuels and lubricants.
  '4681-8/01',
  '4681-8/02',
  '4681-8/03',
  '4681-8/04',
  '4681-8/05',
  '4682-6/00',
  '4732-6/00',
  '4784-9/00',
];

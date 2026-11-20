import 'server-only';
import heroPersona from '@refund/personas/data/dev-exportador.json' with { type: 'json' };
import type { PublicCompany } from '@refund/sources';
import { parsePublicCompany } from '@refund/sources';

// Companies the replay CNPJ provider answers for (ARCHITECTURE §4.3, §5.3): the personas, plus one
// synthetic company outside the Simples so `/app` can show the REGIME_OUT_OF_SCOPE path without a
// network call (E11 definition of done), and one in the Simples with a CNAE outside the table (the
// activity stop). Every CNPJ here is synthetic: the alphanumeric `RF…` root of
// the personas (ARCHITECTURE §7.5); `RFPRES01000137` answered 404 on BrasilAPI on 16/11/2026 (with the
// positive control answering 200). It belongs in @refund/personas' list; see EXECUTION §9 (E11).

/** Synthetic Lucro Presumido company (no person, no address, no QSA: whitelist fields only). */
const PRESUMIDO: PublicCompany = {
  cnpj: 'RFPRES01000137' as PublicCompany['cnpj'],
  displayLegalName: 'CONSULTORIA PRESUMIDA EXEMPLO LTDA',
  displayTradeName: 'Consultoria Exemplo',
  masked: false,
  legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
  size: 'OTHER',
  primaryCnae: {
    code: '7020-4/00',
    description:
      'Atividades de consultoria em gestão empresarial, exceto consultoria técnica específica',
  },
  secondaryCnaes: [],
  registrationStatus: 'ATIVA',
  activityStartDate: '2015-06-01' as PublicCompany['activityStartDate'],
  uf: 'SP',
  ibgeMunicipality: '3550308',
  simples: { optedIn: false, since: null, excludedAt: null },
  mei: { optedIn: false, since: null, excludedAt: null },
  taxRegimeHistory: [{ year: 2025, form: 'LUCRO PRESUMIDO' }],
  source: 'replay',
  fetchedAt: '2026-11-16T12:00:00.000Z',
};

/**
 * Synthetic Simples company whose CNAE the engine does not calculate (beer and soft-drink wholesale, 4635-4/02:
 * ambiguous, Res. CGSN 140, Anexo VII), so `/app` can show the activity stop at the estimate without a network call.
 * Until D50 it was a cosmetics retailer (4772-5/00, now Anexo I, in scope); until D52 a construction company
 * (4120-4/00, Anexo IV, now in scope). Same rules as PRESUMIDO: whitelist fields only.
 */
const UNSUPPORTED_ACTIVITY: PublicCompany = {
  cnpj: 'RFCOSM01000136' as PublicCompany['cnpj'],
  displayLegalName: 'DISTRIBUIDORA EXEMPLO LTDA',
  displayTradeName: 'Distribuidora Exemplo',
  masked: false,
  legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
  size: 'ME',
  primaryCnae: {
    code: '4635-4/02',
    description: 'Comércio atacadista de cerveja, chope e refrigerante',
  },
  secondaryCnaes: [],
  registrationStatus: 'ATIVA',
  activityStartDate: '2019-03-01' as PublicCompany['activityStartDate'],
  uf: 'SP',
  ibgeMunicipality: '3550308',
  simples: { optedIn: true, since: '2019-03-01', excludedAt: null },
  mei: { optedIn: false, since: null, excludedAt: null },
  taxRegimeHistory: [],
  source: 'replay',
  fetchedAt: '2026-11-20T12:00:00.000Z',
};

/**
 * Bug bash 20/11 (H4, H5): synthetic companies for the status and MEI stops, so the e2e reaches them without a
 * network call. Same rules: whitelist fields only, no person, no QSA; the MEI's legal name is masked like a real
 * EI/MEI's (ARCHITECTURE §7, "Mandatory mask").
 */
function closed(cnpj: string, status: string, name: string): PublicCompany {
  return {
    ...PRESUMIDO,
    cnpj: cnpj as PublicCompany['cnpj'],
    displayLegalName: name,
    displayTradeName: null,
    registrationStatus: status,
    taxRegimeHistory: [],
  };
}

const BAIXADA = closed('RFBAIX01000136', 'BAIXADA', 'CONSTRUTORA ENCERRADA EXEMPLO LTDA');
const INAPTA = closed('RFINAP01000143', 'INAPTA', 'MOVEIS INAPTOS EXEMPLO LTDA');
const SUSPENSA = closed('RFSUSP01000170', 'SUSPENSA', 'COMERCIO SUSPENSO EXEMPLO LTDA');

const MEI: PublicCompany = {
  cnpj: 'RFMEIS01000128' as PublicCompany['cnpj'],
  displayLegalName: 'Empresário individual · nome oculto',
  displayTradeName: null,
  masked: true,
  legalNature: { code: '2135', description: 'Empresário (Individual)' },
  size: 'MEI',
  primaryCnae: { code: '9602-5/01', description: 'Cabeleireiros, manicure e pedicure' },
  secondaryCnaes: [],
  registrationStatus: 'ATIVA',
  activityStartDate: '2024-03-01' as PublicCompany['activityStartDate'],
  uf: 'SP',
  ibgeMunicipality: '3550308',
  simples: { optedIn: true, since: '2024-03-01', excludedAt: null },
  mei: { optedIn: true, since: '2024-03-01', excludedAt: null },
  taxRegimeHistory: [],
  source: 'replay',
  fetchedAt: '2026-11-20T12:00:00.000Z',
};

function persona(raw: { company: unknown }): PublicCompany {
  const company = parsePublicCompany(raw.company);
  if (!company) throw new Error('PERSONA_COMPANY_INVALID');
  return company;
}

export const REPLAY_COMPANIES: readonly PublicCompany[] = [
  persona(heroPersona),
  PRESUMIDO,
  UNSUPPORTED_ACTIVITY,
  BAIXADA,
  INAPTA,
  SUSPENSA,
  MEI,
];

export const HERO_CNPJ = 'RFDEV001000158';
export const PRESUMIDO_CNPJ = PRESUMIDO.cnpj;
export const UNSUPPORTED_ACTIVITY_CNPJ = UNSUPPORTED_ACTIVITY.cnpj;

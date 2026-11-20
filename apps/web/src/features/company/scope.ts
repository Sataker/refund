import { cnaeAnexoRow, cnaeInScope } from '@refund/engine';
import type { PublicCompany } from '@refund/sources';

// H3 (UX review 19/11): Refund calculates only companies in the Simples Nacional (and MEI). A company in another
// regime stops at "É você?" with the reason in plain words; it never goes on to consent and the bank steps (a bank
// connection would be wasted and the analysis would fail with a reason about the activity, not the regime).
// Pure: it reads the whitelisted public data only (ENGINE-SPEC C.11.5 item 3, the same test as estimateByProfile).
//
// The activity (CNAE) gets the same treatment one step later, at the estimate: a CNAE outside the verified rows of
// `cnae-anexo.json` (C.11.5 item 4, the same test as estimateByProfile) stops there instead of running the bank steps
// and an analysis that can only end in CNAE_OUT_OF_SCOPE. The table is a tax decision: never widened here.

/** "LUCRO PRESUMIDO" → "Lucro Presumido". */
function title(form: string): string {
  return form
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const UPPER_WORDS = new Set(['sa', 's/a', 's.a.', 'me', 'epp', 'eireli']);

/**
 * The company as named in a sentence: its legal name (razão social), already masked by the whitelist for EI/MEI
 * (ARCHITECTURE §7, "Mandatory mask"); a masked one reads "sua empresa". Never the trade name: a head office's trade
 * name can be a department ("DIRECAO GERAL").
 */
export function companyNameOf(company: Pick<PublicCompany, 'displayLegalName' | 'masked'>): string {
  if (company.masked) return 'sua empresa';
  return company.displayLegalName
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => {
      if (UPPER_WORDS.has(w)) return w.toUpperCase();
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      return w.replace(/^\p{L}/u, (c) => c.toUpperCase());
    })
    .join(' ');
}

/** The regime name when the company is out of scope (not Simples, not MEI); null when it is in scope. */
export function outOfScopeRegime(
  company: Pick<PublicCompany, 'simples' | 'mei' | 'taxRegimeHistory'>,
): string | null {
  if (company.mei.optedIn || company.simples.optedIn) return null;
  const last = company.taxRegimeHistory.at(-1);
  return last && last.form.trim() !== '' ? title(last.form) : 'regime fora do Simples Nacional';
}

/**
 * The regime as a predicate (bug bash 20/11): "está no Lucro Real", "é isenta de IRPJ"; no article before the company
 * name, whose gender we do not know ("Banco do Brasil SA está no Lucro Real.").
 */
export function regimePhrase(regime: string): string {
  const r = regime.trim().toLowerCase();
  if (r.startsWith('isenta')) return 'é isenta de IRPJ';
  if (r.startsWith('imune')) return 'é imune do IRPJ';
  if (r.startsWith('lucro')) return `está no ${regime}`;
  return 'está fora do Simples Nacional';
}

/** The stop message, with the company's own name and regime. */
export function outOfScopeMessage(companyName: string, regime: string): string {
  const name = companyName === 'sua empresa' ? 'Sua empresa' : companyName;
  return `Por enquanto o Refund calcula só empresas do Simples Nacional. ${name} ${regimePhrase(regime)}.`;
}

/**
 * Bug bash 20/11 (H4): a company that is not active at the Receita stops at "É você?" with that reason, before the
 * regime (a closed company is "fora do Simples" too, but that is not why we stop).
 */
export function statusStopMessage(registrationStatus: string): string | null {
  const status = registrationStatus.trim().toUpperCase();
  if (status === 'ATIVA' || status === '') return null;
  if (status === 'BAIXADA')
    return 'Esta empresa está baixada na Receita (encerrada). O Refund analisa empresas ativas.';
  if (status === 'INAPTA')
    return 'Esta empresa está inapta na Receita. Regularize a situação com seu contador antes de planejar impostos.';
  if (status === 'SUSPENSA')
    return 'Esta empresa está suspensa na Receita. Regularize a situação com seu contador antes de planejar impostos.';
  if (status === 'NULA')
    return 'Este CNPJ foi anulado na Receita. O Refund analisa empresas ativas.';
  return `Esta empresa não está ativa na Receita (situação: ${status.toLowerCase()}). O Refund analisa empresas ativas.`;
}

/**
 * The company stop at "É você?", or null when it goes on: first the registration status (H4), then the regime (H3).
 * `regime` is the regime name for a regime stop, the status for a status stop.
 */
export function regimeStop(
  company: Pick<
    PublicCompany,
    'simples' | 'mei' | 'taxRegimeHistory' | 'displayLegalName' | 'masked' | 'registrationStatus'
  >,
): { reason: 'status' | 'regime'; regime: string; message: string } | null {
  const status = statusStopMessage(company.registrationStatus);
  if (status !== null)
    return {
      reason: 'status',
      regime: company.registrationStatus.trim().toLowerCase(),
      message: status,
    };
  const regime = outOfScopeRegime(company);
  return regime === null
    ? null
    : {
        reason: 'regime',
        regime,
        message: outOfScopeMessage(companyNameOf(company), regime),
      };
}

/** "4120-4/00 Construção de edifícios": the company's own code and description, as the public data gives them. */
function activityLabel(cnae: { code: string; description: string }): string {
  return [cnae.code, cnae.description].filter((s) => s.trim() !== '').join(' ');
}

/**
 * The activity stop message, from the row of the CNAE table (D50, 20/11): one reason per case, never a list of the
 * activities Refund calculates (hundreds since the table covers every CNAE 2.3 subclass).
 */
export function activityOutOfScopeMessage(cnae: { code: string; description: string }): string {
  const row = cnaeAnexoRow(cnae.code);
  if (row === undefined) return `Não encontramos a atividade ${cnae.code} na tabela oficial.`;
  if (row.status === 'impeditive') {
    return `A atividade ${activityLabel(cnae)} não pode estar no Simples Nacional.`;
  }
  if (row.status === 'verified' && row.anexoAdjustment !== undefined) {
    const how =
      row.anexoAdjustment === 'without_iss'
        ? 'sem a parcela do ISS'
        : 'sem a parcela do ISS e com a do ICMS';
    return `Por enquanto o Refund calcula os anexos do Simples só na tabela comum. A sua (${activityLabel(cnae)}) é do Anexo III ${how}.`;
  }
  // Ambiguous (or a row still to be confirmed): the anexo is not fixed for us yet.
  return `O anexo da sua atividade (${cnae.code}) depende do que exatamente a empresa faz; por enquanto não calculamos esse caso.`;
}

/**
 * Bug bash 20/11 (H5): an MEI pays a fixed DAS-MEI, so there is no saving to calculate; the track stops at the
 * estimate with this, never with an "anexo" (an MEI has none to choose).
 */
export const MEI_STOP_MESSAGE =
  'No MEI o imposto é um valor fixo por mês (DAS-MEI), então não há economia a calcular aqui. Fique de olho no limite de faturamento do MEI.';

/** The stop at the estimate: the MEI first, then the activity (CNAE); null when the track goes on. */
export function estimateStop(
  company: Pick<PublicCompany, 'primaryCnae' | 'mei'>,
): { reason: 'mei' | 'activity'; cnae: string; message: string } | null {
  if (company.mei.optedIn)
    return { reason: 'mei', cnae: company.primaryCnae.code, message: MEI_STOP_MESSAGE };
  const activity = activityStop(company);
  return activity === null ? null : { reason: 'activity', ...activity };
}

/** The activity stop of a company whose regime is in scope, or null when its CNAE is in the verified table. */
export function activityStop(
  company: Pick<PublicCompany, 'primaryCnae'>,
): { cnae: string; message: string } | null {
  return cnaeInScope(company.primaryCnae.code)
    ? null
    : { cnae: company.primaryCnae.code, message: activityOutOfScopeMessage(company.primaryCnae) };
}

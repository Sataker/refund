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

/** The stop message, with the company's own name and regime. */
export function outOfScopeMessage(companyName: string, regime: string): string {
  return `Por enquanto o Refund calcula só empresas do Simples Nacional. A ${companyName} está no ${regime}.`;
}

/** The regime stop of a company, or null when its regime is in scope. */
export function regimeStop(
  company: Pick<
    PublicCompany,
    'simples' | 'mei' | 'taxRegimeHistory' | 'displayLegalName' | 'masked'
  >,
): { regime: string; message: string } | null {
  const regime = outOfScopeRegime(company);
  return regime === null
    ? null
    : { regime, message: outOfScopeMessage(companyNameOf(company), regime) };
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
  if (row.status === 'verified' && (row.baseAnexo === 'II' || row.baseAnexo === 'IV')) {
    return `Por enquanto o Refund calcula atividades dos Anexos I, III e V do Simples. A sua (${activityLabel(cnae)}) é do Anexo ${row.baseAnexo}.`;
  }
  if (row.status === 'verified' && row.anexoAdjustment !== undefined) {
    const how =
      row.anexoAdjustment === 'without_iss'
        ? 'sem a parcela do ISS'
        : 'sem a parcela do ISS e com a do ICMS';
    return `Por enquanto o Refund calcula atividades dos Anexos I, III e V do Simples na tabela comum. A sua (${activityLabel(cnae)}) é do Anexo III ${how}.`;
  }
  // Ambiguous, and the dentistry row still to be confirmed (E.4): the anexo is not fixed for us yet.
  return `O anexo da sua atividade (${cnae.code}) depende do que exatamente a empresa faz; por enquanto não calculamos esse caso.`;
}

/** The activity stop of a company whose regime is in scope, or null when its CNAE is in the verified table. */
export function activityStop(
  company: Pick<PublicCompany, 'primaryCnae'>,
): { cnae: string; message: string } | null {
  return cnaeInScope(company.primaryCnae.code)
    ? null
    : { cnae: company.primaryCnae.code, message: activityOutOfScopeMessage(company.primaryCnae) };
}

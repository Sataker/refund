// Display-only wording for Screen 4 (IDENTITY-AND-UI §2.3, "Finding card"). Nothing here touches a number or a
// citation: the engine's titles stay the action titles of Screen 6; Screen 4 shows the plain headline.

/** Short card headline per rule on Screen 4; anything else keeps the engine title. */
export const SHORT_TITLE: Readonly<Record<string, string>> = {
  R01: 'Aumentar seu pró-labore reduz seu imposto',
  R05: 'Separar a receita de exportação no PGDAS-D',
};

/**
 * Alerts and risks on Screens 5–8 get a display headline; the engine title stays as the card body, unchanged (UX
 * review M5). Screen 4 keeps the engine title for them.
 */
export const ALERT_TITLE: Readonly<Record<string, string>> = {
  R02: 'Lucro acima de R$ 50 mil no mês teve 10% de IR retido',
  A01: 'Despesa pessoal no cartão da empresa',
  R06: 'Produtos com PIS e Cofins monofásicos',
};

/**
 * Bug bash 20/11 (H3): the engine's R06 alert (D.6, no `monofasicoPct`) promises "responda 1 pergunta", but no screen
 * asks it yet (ENGINE-SPEC E.4: "until the question exists"; Screen 7 has no such card). The web shows what actually
 * happens next instead; the engine text stays as T06-02 pins it.
 */
export const R06_QUESTION_TEXT =
  'Você revende produtos com PIS e Cofins monofásicos. Para calcular, seu contador identifica, pelo NCM, quais produtos têm PIS e Cofins monofásicos.';

/** The engine's finding text as shown on every screen (the engine's own, except the R06 alert above). */
export function findingText(f: { ruleId: string; type: string; title: string }): string {
  if (f.ruleId === 'R06' && f.type === 'alert') return R06_QUESTION_TEXT;
  return f.title;
}

/**
 * Recovery headline on Screens 5–8 (UX review G2 M7): short and plain; the engine title stays as the body under it.
 */
export const RECOVERY_TITLE: Readonly<Record<string, string>> = {
  'R05-REC': 'Imposto pago a mais nos últimos 5 anos',
};

/** Display headline for any finding on Screens 5–8: short title, alert title, or the engine title. */
export function displayTitle(ruleId: string, engineTitle: string): string {
  return SHORT_TITLE[ruleId] ?? ALERT_TITLE[ruleId] ?? RECOVERY_TITLE[ruleId] ?? engineTitle;
}

/** IDENTITY-AND-UI §2.3, "Risk (illicit)": the fixed line under a risk card. */
export const RISK_LINE = 'Isso parece economia, mas é risco. Não recomendamos. Veja por quê.';

export function shortTitle(ruleId: string, engineTitle: string): string {
  return SHORT_TITLE[ruleId] ?? engineTitle;
}

/** Keeps "R$" on the same line as its number (a no-break space), for text that comes from the engine. */
export function keepCurrency(text: string): string {
  return text.replaceAll('R$ ', 'R$ ');
}

/**
 * The decorative statement column of stage 1: a masked person ("[pessoa]", ARCHITECTURE §6) reads as plain
 * words, never as a bracketed token.
 */
export function sampleDescription(description: string, amountCents: number): string {
  if (!description.includes('[pessoa]')) return description;
  if (/^PIX\b/i.test(description))
    return amountCents >= 0 ? 'Pix recebido · pessoa física' : 'Pix enviado · pessoa física';
  return 'Pagamento · pessoa física';
}

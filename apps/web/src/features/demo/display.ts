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
};

/** Display headline for any finding on Screens 5–8: short title, alert title, or the engine title. */
export function displayTitle(ruleId: string, engineTitle: string): string {
  return SHORT_TITLE[ruleId] ?? ALERT_TITLE[ruleId] ?? engineTitle;
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

// "A lei mudou" summary (ARCHITECTURE §2.6). Deterministic template only: it names provisions from the @refund/law
// labels and no number. The scraped diff does not go to the model until a slotted `summarizeDiff` (ADR-016) exists
// (code review E16, M2; EXECUTION §9).

export const DIFF_TEMPLATE_VERSION = 'diff-template@1';

export interface LawChangeSummaryInput {
  /** "LC 123/2006" */
  regulationLabel: string;
  /** Labels of the corpus provisions the diff touches ("LC 123/2006, art. 18-A, § 1º"). */
  articleLabels: readonly string[];
}

const list = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join('; ')} e ${items[items.length - 1]}`;

export function templateDiffSummary(input: LawChangeSummaryInput): string {
  if (input.articleLabels.length === 0) {
    return `Mudou o texto da página de ${input.regulationLabel}, fora dos dispositivos que o Refund usa nos cálculos. Uma pessoa vai conferir a mudança antes de qualquer ajuste.`;
  }
  return `Mudou o texto de ${list(input.articleLabels)}. Os cálculos que usam ${input.articleLabels.length === 1 ? 'esse dispositivo' : 'esses dispositivos'} foram marcados para revisão; nenhum número muda até a nova regra ser conferida e publicada no Refund.`;
}

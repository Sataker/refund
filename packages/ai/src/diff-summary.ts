// "A lei mudou" summary (ARCHITECTURE §2.6: "AI summarizes the diff with citation guard"). The model goes through
// `summarizeDiff` (numeric and citation guards); without the AI capability, or when the model fails or a guard
// rejects it, the deterministic template below is used. The template only names provisions from @refund/law labels.
import { type GatewayOptions, summarizeDiff } from './gateway.ts';

export const DIFF_TEMPLATE_VERSION = 'diff-template@1';

export interface LawChangeSummaryInput {
  /** Unified diff of the page (public law text). */
  diff: string;
  /** "LC 123/2006" */
  regulationLabel: string;
  /** Labels of the corpus provisions the diff touches ("LC 123/2006, art. 18-A, § 1º"). */
  articleLabels: readonly string[];
}

export interface LawChangeSummary {
  summary: string;
  origin: 'llm' | 'template';
  model?: string;
  promptVersion: string;
}

const list = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join('; ')} e ${items[items.length - 1]}`;

export function templateDiffSummary(input: Omit<LawChangeSummaryInput, 'diff'>): string {
  if (input.articleLabels.length === 0) {
    return `Mudou o texto da página de ${input.regulationLabel}, fora dos dispositivos que o Refund usa nos cálculos. Uma pessoa vai conferir a mudança antes de qualquer ajuste.`;
  }
  return `Mudou o texto de ${list(input.articleLabels)}. Os cálculos que usam ${input.articleLabels.length === 1 ? 'esse dispositivo' : 'esses dispositivos'} foram marcados para revisão; nenhum número muda até a nova regra ser conferida e publicada no Refund.`;
}

/** Model summary behind the guards, or the template (never throws). `options` null = no AI capability. */
export async function summarizeLawChange(
  input: LawChangeSummaryInput,
  options: GatewayOptions | null,
): Promise<LawChangeSummary> {
  if (options !== null) {
    try {
      const res = await summarizeDiff(input.diff, input.regulationLabel, options);
      if (res !== null) {
        return {
          summary: res.summary,
          origin: 'llm',
          model: res.model,
          promptVersion: res.promptVersion,
        };
      }
    } catch {
      // Falls through to the template: the alert never depends on the model.
    }
  }
  return {
    summary: templateDiffSummary(input),
    origin: 'template',
    promptVersion: DIFF_TEMPLATE_VERSION,
  };
}

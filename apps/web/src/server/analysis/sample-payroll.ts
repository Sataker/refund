import 'server-only';
import answerKeyJson from '@refund/personas/data/dev-exportador.answer-key.json' with {
  type: 'json',
};
import type { QuestionAnswer } from '@refund/pipeline';

// H1 (UX review 19/11): the payroll card (D22) needs the gross payroll month by month, never a plain "yes". The only
// payroll report /app has is the one that ships with the sample statements ("Usar dados de exemplo"): the synthetic
// persona's accountant report (ENGINE-SPEC F.2), the same series /demo answers with. A real or sandbox connection has
// no report, so the card stays unanswered there and the payroll stays FGTS ÷ 8%, estimated.

export const PAYROLL_CARD_ID = 'clt-payroll-gross';

const card = (answerKeyJson as { cardAnswers: { id: string; answer: unknown }[] }).cardAnswers.find(
  (c) => c.id === PAYROLL_CARD_ID,
);

/** The sample persona's per-month gross payroll ("YYYY-MM" → cents), as the pipeline reads it. */
export function samplePayrollSeries(): QuestionAnswer['value'] | null {
  const series = card?.answer;
  if (typeof series !== 'object' || series === null) return null;
  const ok = Object.entries(series).every(
    ([m, v]) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && Number.isSafeInteger(v) && (v as number) >= 0,
  );
  return ok ? (series as QuestionAnswer['value']) : null;
}

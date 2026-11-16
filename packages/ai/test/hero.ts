// The hero persona through the real pipeline (TESTS §1: a test that needs both pipeline and ai lives in ai/test).
// Reuses the pipeline's own harness so both packages run the hero exactly the same way.
import type { Finding } from '@refund/engine';
import type { AnalysisDeps, ExplanationInput, LlmPort, PipelineResult } from '@refund/pipeline';
import { answersFromKey, deps, heroInput, run } from '../../pipeline/test/helpers.ts';

export { deps, heroInput, run };

export interface HeroRuns {
  unanswered: PipelineResult;
  answered: PipelineResult;
}

/** Both hero runs /demo shows: before the cards (awaiting confirmation) and with every F.2 card answered. */
export async function heroRuns(llm?: LlmPort): Promise<HeroRuns> {
  const d: Partial<AnalysisDeps> = llm === undefined ? {} : { llm };
  const unanswered = (await run(heroInput(), deps(d))).result;
  const answers = answersFromKey(unanswered.questions);
  const answered = (await run(heroInput({ answers }), deps(d))).result;
  return { unanswered, answered };
}

export const findingsOf = (r: PipelineResult): Finding[] => r.engineResult?.findings ?? [];

/** The exact ExplanationInput the pipeline sends for each finding (articles resolved from @refund/law). */
export function explanationInputs(r: PipelineResult): ExplanationInput[] {
  const article = deps().article;
  return findingsOf(r).map((finding) => ({
    finding,
    articles: finding.refs.flatMap((ref) => {
      const a = article(ref.id);
      return a === undefined ? [] : [a];
    }),
    audience: 'owner' as const,
  }));
}

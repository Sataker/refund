import 'server-only';
import { answersFromChoices } from '@/features/findings/confirm';
import { type DashboardModel, dashboardModel } from '@/features/findings/model';
import { runDemoWithAnswers } from './analysis.ts';
import { demoSnapshot } from './snapshot.ts';

// Screen 7 on /demo: the visitor changed a card. The pipeline runs again with the new answers and the engine gives
// the new numbers; nothing here computes an amount. No state is written anywhere (ARCHITECTURE §4.7 note).

export interface Recalculated {
  dashboard: DashboardModel;
  /** Cards still open after these answers ("Não sei" keeps a card open). */
  open: number;
}

export type RecalculateResult =
  | { ok: true; value: Recalculated }
  | { ok: false; error: 'UNKNOWN_PERSONA' | 'ANALYSIS_UNAVAILABLE' };

export async function recalculateDemo(
  personaId: string,
  choices: Readonly<Record<string, string>>,
): Promise<RecalculateResult> {
  const snap = await demoSnapshot(personaId);
  if (!snap.ok)
    return {
      ok: false,
      error: snap.reason === 'UNKNOWN_PERSONA' ? 'UNKNOWN_PERSONA' : 'ANALYSIS_UNAVAILABLE',
    };
  const { persona, cards, personaAnswers } = snap.value;
  const result = await runDemoWithAnswers(
    persona,
    answersFromChoices(cards, personaAnswers, choices),
  );
  if (result.engineResult === null) return { ok: false, error: 'ANALYSIS_UNAVAILABLE' };
  return {
    ok: true,
    value: {
      dashboard: dashboardModel(result.engineResult, persona.data.analysisDate),
      open: result.questions.length,
    },
  };
}

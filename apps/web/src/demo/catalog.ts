import 'server-only';
import type { ProfileAnswers } from '@refund/engine';
import type { AnswerKey, CardAnswer, PersonaData, PersonaId, VideoNumber } from '@refund/personas';
import answerKeyJson from '@refund/personas/data/dev-exportador.answer-key.json' with {
  type: 'json',
};
import personaJson from '@refund/personas/data/dev-exportador.json' with { type: 'json' };

// The /demo personas (ARCHITECTURE §7.2 and §7.5): static JSON imports, so the build carries everything and
// the demo needs zero env, no database and no network. Only the hero exists in P0 (PLAN v2 §3.1).

export interface DemoPersona {
  id: PersonaId;
  /** ARCHITECTURE §7.5: the hero (ENGINE-SPEC D15) is featured on /demo and in every link to the demo. */
  hero: boolean;
  /** One line under the company name on the selector (IDENTITY-AND-UI §2.3 "Demo button"). */
  role: string;
  data: PersonaData;
  /**
   * The persona's answers to the first-access track (IDENTITY-AND-UI §5 "On /demo"), pre-selected on screen
   * and changeable by the visitor. The hero's yield [12.463,38; 90.779,28] (ENGINE-SPEC C.11, T11-09).
   */
  profileAnswers: ProfileAnswers;
  /**
   * The persona's own answers to the confirmation cards (ENGINE-SPEC F.2, "Cards answered (all yes)"). The
   * answer key is where E3 recorded them; the live analysis on /demo runs with them, which is why it ends at
   * the video number (F.4) instead of the unconfirmed 28.316,52.
   */
  cardAnswers: CardAnswer[];
  /** The profession on the health card (F.2: "psychologist = care for the holder"). */
  healthProfession: string;
  /** The numbers the video shows, by screen and testId (answer key, ENGINE-SPEC F.4; TESTS §6.4 P3). */
  videoNumbers: readonly VideoNumber[];
}

const heroKey = answerKeyJson as unknown as AnswerKey;

const HERO: DemoPersona = {
  id: 'dev-exportador',
  hero: true,
  role: 'dev que exporta software',
  data: personaJson as unknown as PersonaData,
  profileAnswers: {
    monthlyRevenueBracket: 'from_30k_to_60k',
    hasEmployees: 'yes',
    receivesFromAbroad: 'half_or_more',
  },
  cardAnswers: heroKey.cardAnswers,
  healthProfession:
    heroKey.expectedFacts.pfDetails.healthExpenses.find((h) => !/^\d/.test(h.cnaeOrProfession))
      ?.cnaeOrProfession ?? '',
  videoNumbers: heroKey.videoNumbers,
};

export const DEMO_PERSONAS: readonly DemoPersona[] = [HERO];

export const DEMO_PERSONA_IDS: readonly string[] = DEMO_PERSONAS.map((p) => p.id);

export function demoPersona(id: string): DemoPersona | undefined {
  return DEMO_PERSONAS.find((p) => p.id === id);
}

/** Transactions per holder, for the stage 1 line ("Lendo 174 transações") and the account cards. */
export function transactionCount(p: DemoPersona, holder?: 'PF' | 'PJ'): number {
  return p.data.items
    .filter((i) => holder === undefined || i.holder === holder)
    .flatMap((i) => i.accounts)
    .reduce((n, a) => n + a.transactions.length, 0);
}

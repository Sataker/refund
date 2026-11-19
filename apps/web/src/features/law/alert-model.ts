import type { SimulationDelta } from './change.ts';

// View model of Screen 9 "A lei mudou" (IDENTITY-AND-UI Screen 9). Built at build time for /demo (demo/law-alert.ts);
// the client component only reveals it ("Simular publicação") and formats it.

export interface LawAlertModel {
  /** Always true on /demo: the publication is simulated and labelled "simulação" (ADR-013). */
  simulation: true;
  /** 'synthetic' while the fixture is not a real recorded delivery (EXECUTION §9, E16). */
  fixtureOrigin: 'live' | 'synthetic';
  /** Honest note under a synthetic fixture (never presented as a real capture); null for a real delivery. */
  fixtureNote: string | null;
  /** "LC 123/2006" */
  regulationLabel: string;
  regulationUrl: string;
  /** Summary shown on the card (template on /demo: no model call). */
  summary: string;
  /** Changed lines, in diff order: removed (old wording) and added (new wording). */
  lines: { kind: 'removed' | 'added'; text: string }[];
  /** Corpus provisions the diff touches (labels from @refund/law). */
  articles: { id: string; label: string; url: string }[];
  /** Rules that read those provisions; `yours` = the persona has a finding of that rule. */
  rules: { ruleId: string; name: string; yours: boolean }[];
  /** The recalculation with the scenario's parameter set, or null while no scenario is defined. */
  delta: SimulationDelta | null;
  /** Number of regulations the monitor watches (the empty state). */
  monitoredCount: number;
  /** CivilDate of the persona's analysis ("desde 12/11"). */
  since: string;
}

/** Plain names of the rules (same words as the analysis screen and the estimate). */
export const RULE_NAMES: Readonly<Record<string, string>> = {
  R01: 'Fator R e pró-labore',
  R05: 'Exportação separada',
  'R05-REC': 'Recuperar o que foi pago a mais',
  R06: 'Produtos monofásicos',
  R04: 'IRPF do sócio',
  R02: 'Dividendos acima de R$ 50 mil',
  R03: 'Limite do Simples e do MEI',
  A01: 'Despesa pessoal na empresa',
  A02: 'Pró-labore abaixo do mínimo',
};

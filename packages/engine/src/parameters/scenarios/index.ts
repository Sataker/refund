// Labelled alternative parameter sets (ARCHITECTURE §2.6 and §3.1 `parameters/scenarios/`; ADR-013). A scenario is
// versioned code like the official set: the "law changed" webhook never writes one, and the /demo shows the one it
// uses labelled "simulação". It replaces records of the official set by (key, effectiveFrom) and may add new ones.
import type { AnyParameterEntry } from '../types.ts';

export interface ParameterScenario {
  /** Set id passed to `analyze(facts, { parameters: id })`. */
  id: string;
  /** pt-BR label shown next to the "simulação" seal. */
  label: string;
  simulation: true;
  /** Records that replace the official one with the same (key, effectiveFrom), or are added when none matches. */
  replaces: readonly AnyParameterEntry[];
}

/**
 * Empty on purpose (EXECUTION §9, E16 row "scenario of the /demo simulation"): neither ENGINE-SPEC nor IDENTITY-AND-UI
 * Screen 9 names the parameter and the value the simulated publication changes (Screen 9 shows "R$ xx.xxx"), and a
 * tax value is not decided in code (CLAUDE.md rule 12). Adding the scenario is one record here plus its golden case.
 */
export const PARAMETER_SCENARIOS: readonly ParameterScenario[] = [];

import { DEV_EXPORTADOR_SEED, generateDevExportador } from './dev-exportador/generate.ts';
import type { GeneratedPersona, PersonaId } from './types.ts';

export const PERSONA_IDS: readonly PersonaId[] = ['dev-exportador'];

export const PERSONA_SEEDS: Readonly<Record<PersonaId, number>> = {
  'dev-exportador': DEV_EXPORTADOR_SEED,
};

/** Deterministic: same id and seed → same objects (TESTS §3.3). */
export function generate(id: PersonaId, seed: number = PERSONA_SEEDS[id]): GeneratedPersona {
  switch (id) {
    case 'dev-exportador':
      return generateDevExportador(seed);
  }
}

/** Raw serialization; `pnpm personas:generate` then formats the files with Biome. */
export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** File names under `packages/personas/data/` (GLOSSARY: `data/<persona>.answer-key.json`). */
export function dataFiles(id: PersonaId): { data: string; answerKey: string } {
  return { data: `${id}.json`, answerKey: `${id}.answer-key.json` };
}

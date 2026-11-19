// The official records without going through parameters/index.ts (which imports the mocked scenarios module).
import { PARAMETERS_2026 } from '../../src/parameters/2026.ts';
import { PARAMETERS_2027 } from '../../src/parameters/2027.ts';
import type { AnyParameterEntry } from '../../src/parameters/types.ts';

export const ALL_PARAMETERS_FOR_TEST: readonly AnyParameterEntry[] = [
  ...PARAMETERS_2026,
  ...PARAMETERS_2027,
];

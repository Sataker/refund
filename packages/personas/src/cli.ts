// `pnpm personas:generate`: regenerates packages/personas/data/ from the seeded generators and
// formats the JSON with Biome (the repo's formatter), so the committed snapshot is byte-for-byte
// reproducible (`pnpm personas:generate && git diff --exit-code packages/personas/data`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataFiles, generate, PERSONA_IDS, serialize } from './generate.ts';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(packageDir, 'data');
const repoRoot = resolve(packageDir, '..', '..');

function main(): void {
  mkdirSync(dataDir, { recursive: true });
  const written: string[] = [];
  for (const id of PERSONA_IDS) {
    const { data, answerKey } = generate(id);
    const files = dataFiles(id);
    for (const [name, value] of [
      [files.data, data],
      [files.answerKey, answerKey],
    ] as const) {
      const path = join(dataDir, name);
      writeFileSync(path, serialize(value));
      written.push(path);
    }
  }
  execFileSync(join(repoRoot, 'node_modules', '.bin', 'biome'), ['format', '--write', ...written], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  process.stdout.write(`personas: wrote ${written.length} files to ${dataDir}\n`);
}

if (import.meta.main) main();

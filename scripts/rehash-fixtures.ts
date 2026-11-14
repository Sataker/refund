// Recomputes `dataSha256` of every fixture (ARCHITECTURE §5.2). Editing a fixture by hand requires this,
// which makes the edit explicit in the diff. The PII guard still runs over the result in pre-commit/CI.
// Usage: node scripts/rehash-fixtures.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { dataSha256, detectPii } from '../packages/sources/src/index.ts';
import { biomeFormat, generateIndex, listFixtureFiles } from './generate-fixtures-index.ts';

function main(): void {
  const changed: string[] = [];
  let refused = 0;
  for (const file of listFixtureFiles()) {
    const envelope = JSON.parse(readFileSync(file, 'utf8')) as {
      data: unknown;
      dataSha256: string;
    };
    const findings = detectPii(envelope.data);
    if (findings.length > 0) {
      for (const f of findings) console.error(`${file}  ${f.path}  [${f.rule}]  ${f.excerpt}`);
      refused++;
      continue;
    }
    const hash = dataSha256(envelope.data);
    if (hash === envelope.dataSha256) continue;
    envelope.dataSha256 = hash;
    writeFileSync(file, `${JSON.stringify(envelope, null, 2)}\n`);
    changed.push(file);
  }
  biomeFormat(changed);
  generateIndex();
  for (const f of changed) console.log(`rehashed ${f}`);
  console.log(`fixtures:rehash: ${changed.length} changed, ${refused} refused (personal data)`);
  if (refused > 0) process.exit(1);
}

if (import.meta.main) main();

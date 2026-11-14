import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_EXPORTADOR_SEED, dataFiles, generate, serialize } from '../src/index.ts';
import { readCommitted } from './helpers.ts';

describe('dev-exportador generator: determinism (TESTS §3.3)', () => {
  it('same seed → same JSON, byte for byte', () => {
    const a = generate('dev-exportador');
    const b = generate('dev-exportador', DEV_EXPORTADOR_SEED);
    expect(serialize(b.data)).toBe(serialize(a.data));
    expect(serialize(b.answerKey)).toBe(serialize(a.answerKey));
  });

  it('the committed snapshot in data/ is exactly what the generator produces', () => {
    const { data, answerKey } = generate('dev-exportador');
    const files = dataFiles('dev-exportador');
    expect(JSON.parse(readCommitted(files.data))).toEqual(JSON.parse(serialize(data)));
    expect(JSON.parse(readCommitted(files.answerKey))).toEqual(JSON.parse(serialize(answerKey)));
  });

  it('the seed only drives ids and CPF masks, never an amount or a date', () => {
    const a = generate('dev-exportador');
    const b = generate('dev-exportador', 7);
    const shape = (g: typeof a) =>
      g.data.items.flatMap((i) =>
        i.accounts.flatMap((acc) =>
          acc.transactions.map((t) => [t.date, t.amountCents, t.description, t.method]),
        ),
      );
    expect(shape(b)).toEqual(shape(a));
    expect(b.data.items[0]?.item.sourceId).not.toBe(a.data.items[0]?.item.sourceId);
  });

  it('the generator source uses no Math.random and no clock', () => {
    const srcDir = join(import.meta.dirname, '..', 'src');
    const files = readdirSync(srcDir, { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const code = readFileSync(join(srcDir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/Math\.random|Date\.now|new Date\b|performance\.now/);
    }
  });
});

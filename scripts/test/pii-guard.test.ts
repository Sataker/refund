import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { cnpjCheckDigits } from '../../packages/sources/src/cnpj/validate.ts';
import { cpfCheckDigits } from '../../packages/sources/src/pii/cpf.ts';
import { FORBIDDEN_KEYS } from '../../packages/sources/src/pii/detect.ts';
import {
  type Exception,
  type GuardContext,
  mask,
  personaCnpjsFrom,
  scanText,
  validateExceptions,
} from '../pii-guard.ts';

// Poisoned fixtures are built at runtime so this file never holds a literal CPF, e-mail or phone.
const cpfDigits = `123456789${cpfCheckDigits('123456789')}`;
const cpf = `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`;
const email = ['maria.souza', 'gmail.com'].join('@');
const phone = `(11) 9${'8765'}-${'4321'}`;
const listedBase = 'RFDEV0010001';
const listed = `${listedBase}${cnpjCheckDigits(listedBase)}`;
const strayBase = 'RFZZZZ990001';
const stray = `${strayBase}${cnpjCheckDigits(strayBase)}`;
const strayMasked = `${stray.slice(0, 2)}.${stray.slice(2, 5)}.${stray.slice(5, 8)}/${stray.slice(8, 12)}-${stray.slice(12)}`;

const ctx: GuardContext = { exceptions: [], personaCnpjs: new Set([listed]) };
const rules = (findings: { rule: string }[]): string[] => findings.map((f) => f.rule);

describe('pii-guard rule 1: forbidden keys in JSON', () => {
  it('fails on a "qsa" key', () => {
    const findings = scanText('fixture.json', '{ "cnpj": "x", "qsa": [] }');
    assert.deepEqual(rules(findings), ['forbidden-key']);
    assert.equal(findings[0]?.line, 1);
  });

  for (const key of FORBIDDEN_KEYS) {
    it(`fails on "${key}" at any depth, with the line`, () => {
      const findings = scanText('fixture.json', `{\n  "a": { "b": [{ "${key}": null }] }\n}`);
      assert.deepEqual(rules(findings), ['forbidden-key']);
      assert.equal(findings[0]?.line, 2);
    });
  }

  it('ignores the words in prose and as string values (e.g. sanitization.discardedFields)', () => {
    assert.deepEqual(scanText('README.md', 'We never store the QSA nor the "email".'), []);
    assert.deepEqual(scanText('f.json', '{ "discardedFields": ["qsa", "email", "cep"] }'), []);
  });
});

describe('pii-guard rule 2: formatted CPF', () => {
  it('fails and masks the excerpt', () => {
    const findings = scanText('notes.md', `holder ${cpf}`);
    assert.deepEqual(rules(findings), ['formatted-cpf']);
    assert.ok(!findings[0]?.excerpt.includes(cpfDigits.slice(2, 9)));
  });
});

describe('pii-guard rule 2: CPF glued to letters or in partial form (code review 14/11)', () => {
  it('fails on REF+formatted CPF, dash-only and spaced forms', () => {
    const spaced = `${cpfDigits.slice(0, 3)} ${cpfDigits.slice(3, 6)} ${cpfDigits.slice(6, 9)} ${cpfDigits.slice(9)}`;
    for (const text of [
      `PIX REF${cpf}`,
      `${cpfDigits.slice(0, 9)}-${cpfDigits.slice(9)}`,
      spaced,
    ]) {
      assert.deepEqual(
        rules(scanText('notes.md', text)),
        ['formatted-cpf'],
        text.length.toString(),
      );
    }
  });
});

describe('pii-guard rule 3: unformatted CPF with a valid check digit', () => {
  it('fails next to a cpf/doc/tax/document/socio key', () => {
    for (const key of ['cpf', 'documentNumber', 'taxNumber', 'socio_doc']) {
      const findings = scanText('f.json', `{ "${key}": "${cpfDigits}" }`);
      assert.ok(rules(findings).includes('unformatted-cpf'), key);
    }
  });

  it('passes without that context, or with an invalid check digit', () => {
    assert.deepEqual(scanText('f.json', `{ "amountCents": ${cpfDigits} }`), []);
    const wrong = `${cpfDigits.slice(0, 10)}${(Number(cpfDigits[10]) + 1) % 10}`;
    assert.deepEqual(scanText('f.json', `{ "cpf": "${wrong}" }`), []);
  });
});

describe('pii-guard rule 4: e-mail outside the allowed domains', () => {
  it('fails on a personal e-mail and masks it', () => {
    const findings = scanText('f.json', `{ "contact": "${email}" }`);
    assert.deepEqual(rules(findings), ['email']);
    assert.ok(!findings[0]?.excerpt.includes('souza'));
  });

  it('passes the allowed domains', () => {
    for (const domain of ['example.com', 'exemplo.com.br', 'refund.invalid', 'userefund.com.br']) {
      assert.deepEqual(scanText('f.md', `write to ${['ana', domain].join('@')}`), [], domain);
    }
  });

  it('passes an e-mail on the exception list, only for the listed file', () => {
    const exceptions: Exception[] = [
      { value: email, file: 'docs/a.md', reason: 'test', source: 'test' },
    ];
    const withException: GuardContext = { ...ctx, exceptions };
    assert.deepEqual(scanText('docs/a.md', email, withException), []);
    assert.deepEqual(rules(scanText('docs/b.md', email, withException)), ['email']);
  });

  it('an exception without a reason excuses nothing', () => {
    const exceptions: Exception[] = [{ value: email, file: '*', reason: '', source: 'test' }];
    assert.deepEqual(rules(scanText('a.md', email, { ...ctx, exceptions })), ['email']);
  });
});

describe('pii-guard rule 5: BR phone near a tel/phone/fone/celular key', () => {
  it('fails next to the key', () => {
    for (const key of ['telefone', 'phone', 'ddd_fone', 'celular']) {
      assert.ok(rules(scanText('f.json', `{ "${key}": "${phone}" }`)).includes('phone'), key);
    }
  });

  it('passes the same digits without the context', () => {
    assert.deepEqual(scanText('f.json', `{ "reference": "${phone}" }`), []);
  });
});

describe('pii-guard rule 6: persona CNPJ not listed in personas/src/cnpjs.ts', () => {
  it('fails on an unlisted CNPJ (bare or masked) inside packages/personas/data/', () => {
    const file = 'packages/personas/data/x.json';
    assert.deepEqual(rules(scanText(file, `{ "cnpj": "${stray}" }`, ctx)), ['persona-cnpj']);
    assert.deepEqual(rules(scanText(file, `{ "mask": "${strayMasked}" }`, ctx)), ['persona-cnpj']);
  });

  it('passes a listed CNPJ, and the same CNPJ outside personas/data', () => {
    assert.deepEqual(scanText('packages/personas/data/x.json', `"${listed}"`, ctx), []);
    assert.deepEqual(scanText('packages/sources/fixtures/x.json', `"${stray}"`, ctx), []);
  });

  it('reads the list from the source of cnpjs.ts', () => {
    const source = `synthetic('${listed}', 'hero'),\nsynthetic("${stray}", 'other')`;
    assert.deepEqual([...personaCnpjsFrom(source)].sort(), [listed, stray].sort());
  });

  it('the committed persona data passes against the committed list', () => {
    const repo = resolve(dirname(new URL(import.meta.url).pathname), '../..');
    const committed: GuardContext = {
      exceptions: [],
      personaCnpjs: personaCnpjsFrom(
        readFileSync(join(repo, 'packages/personas/src/cnpjs.ts'), 'utf8'),
      ),
    };
    for (const f of ['dev-exportador.json', 'dev-exportador.answer-key.json']) {
      const path = `packages/personas/data/${f}`;
      assert.deepEqual(scanText(path, readFileSync(join(repo, path), 'utf8'), committed), [], f);
    }
  });
});

describe('pii-guard: clean fixture and exception list', () => {
  it('passes a clean fixture', () => {
    const clean = JSON.stringify({ cnpj: listed, name: 'Marina', mask: '***.711.985-**' });
    assert.deepEqual(scanText('packages/personas/data/clean.json', clean, ctx), []);
  });

  it('rejects an exception without a reason', () => {
    const findings = validateExceptions([
      { value: ['x', 'example.org'].join('@'), file: '*', reason: ' ', source: 'test' },
    ]);
    assert.deepEqual(rules(findings), ['exception-without-reason']);
  });

  it('rejects a CPF on the exception list (CPFs have no exception)', () => {
    assert.deepEqual(
      rules(validateExceptions([{ value: cpf, file: '*', reason: 't', source: 't' }])),
      ['cpf-in-exceptions'],
    );
  });

  it('masks short and long values', () => {
    assert.equal(mask('abc'), '***');
    assert.equal(mask('abcdefgh'), 'ab****gh');
  });
});

describe('pnpm guard end to end (definition of done: a planted qsa brings it down)', () => {
  const guard = resolve(dirname(new URL(import.meta.url).pathname), '../pii-guard.ts');

  function runIn(files: Record<string, string>): { status: number | null; output: string } {
    const dir = mkdtempSync(join(tmpdir(), 'pii-guard-'));
    try {
      spawnSync('git', ['init', '-q'], { cwd: dir });
      for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), content);
      }
      const r = spawnSync(process.execPath, [guard, '--ci'], { cwd: dir, encoding: 'utf8' });
      return { status: r.status, output: `${r.stdout}${r.stderr}` };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('fails when a fixture carries a qsa, and prints the path, line and rule', () => {
    const r = runIn({
      'scripts/pii-exceptions.json': '[]',
      'packages/sources/fixtures/cnpj/x.json': '{\n  "data": {\n    "qsa": []\n  }\n}\n',
    });
    assert.equal(r.status, 1);
    assert.match(r.output, /packages\/sources\/fixtures\/cnpj\/x\.json:3 {2}\[forbidden-key\]/);
  });

  it('never prints the whole personal value it found', () => {
    const r = runIn({
      'scripts/pii-exceptions.json': '[]',
      'notes.md': `cpf ${cpf} mail ${email}`,
    });
    assert.equal(r.status, 1);
    assert.ok(!r.output.includes(cpf) && !r.output.includes(email));
  });

  it('passes a clean tree', () => {
    const r = runIn({
      'scripts/pii-exceptions.json': '[]',
      'packages/sources/fixtures/sgs/x.json':
        '{ "data": [{ "date": "2026-11-12", "value": "15.00" }] }',
    });
    assert.equal(r.status, 0, r.output);
  });
});

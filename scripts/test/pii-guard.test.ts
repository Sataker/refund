import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mask, scanText, validateExceptions } from '../pii-guard.ts';

// Poisoned fixtures are built at runtime so this file never holds a literal CPF.
const cpf = `${['123', '456', '789'].join('.')}-09`;

describe('pii-guard', () => {
  it('fails on a "qsa" key in JSON', () => {
    const findings = scanText('fixture.json', '{ "cnpj": "x", "qsa": [] }');
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.rule, 'forbidden-key');
  });

  it('fails on a "cnpj_cpf_do_socio" key at any depth', () => {
    const findings = scanText('fixture.json', '{ "a": { "b": [{ "cnpj_cpf_do_socio": "" }] } }');
    assert.equal(findings[0]?.rule, 'forbidden-key');
  });

  it('ignores "qsa" in prose (only JSON keys count)', () => {
    assert.deepEqual(scanText('README.md', 'We never store the QSA.'), []);
  });

  it('fails on a formatted CPF and masks it in the output', () => {
    const findings = scanText('notes.md', `holder ${cpf}`);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.rule, 'formatted-cpf');
    assert.ok(!findings[0]?.excerpt.includes(cpf));
  });

  it('passes a clean fixture', () => {
    assert.deepEqual(scanText('clean.json', '{ "cnpj": "RFDEV001000100", "name": "Marina" }'), []);
  });

  it('rejects an exception without a reason', () => {
    const findings = validateExceptions([
      { value: 'x@y.com', file: '*', reason: ' ', source: 'test' },
    ]);
    assert.equal(findings[0]?.rule, 'exception-without-reason');
  });

  it('masks short and long values', () => {
    assert.equal(mask('abc'), '***');
    assert.equal(mask('abcdef'), 'ab**ef');
  });
});

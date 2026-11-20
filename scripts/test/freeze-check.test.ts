import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contactProblems, readmeProblems, statusPageProblems } from '../freeze-check.ts';
import { inputsHashProblems } from '../generate-engine-page.ts';

// Freeze check 11 (compliance review E14, M1): the contact address on /privacidade must be real before the freeze.

describe('contactProblems', () => {
  it('fails on the placeholder', () => {
    const src =
      "export const CONTACT_PLACEHOLDER = 'CONTATO_PENDENTE';\nexport const CONTACT_EMAIL: string = CONTACT_PLACEHOLDER;\n";
    assert.equal(contactProblems(src).length, 1);
    assert.equal(contactProblems("export const CONTACT_EMAIL = 'CONTATO_PENDENTE';").length, 1);
  });

  it('fails when the constant is missing', () => {
    assert.equal(contactProblems('export const OTHER = 1;').length, 1);
  });

  it('passes on an e-mail literal', () => {
    assert.deepEqual(
      contactProblems("export const CONTACT_EMAIL: string = 'contato@example.com';"),
      [],
    );
  });
});

// Freeze check 12 (E20): /status must link the real UptimeRobot page before the freeze.
describe('statusPageProblems', () => {
  it('fails on the placeholder', () => {
    const src =
      "export const STATUS_PAGE_PLACEHOLDER = 'STATUS_PENDENTE';\nexport const STATUS_PAGE_URL: string = STATUS_PAGE_PLACEHOLDER;\n";
    assert.equal(statusPageProblems(src).length, 1);
    assert.equal(statusPageProblems("export const STATUS_PAGE_URL = 'STATUS_PENDENTE';").length, 1);
  });

  it('fails when the constant is missing or the URL is not UptimeRobot over https', () => {
    assert.equal(statusPageProblems('export const OTHER = 1;').length, 1);
    assert.equal(
      statusPageProblems("export const STATUS_PAGE_URL = 'http://stats.uptimerobot.com/abc';")
        .length,
      1,
    );
    assert.equal(
      statusPageProblems("export const STATUS_PAGE_URL = 'https://example.com/status';").length,
      1,
    );
    assert.equal(
      statusPageProblems("export const STATUS_PAGE_URL = 'https://evil-uptimerobot.com/x';").length,
      1,
    );
  });

  it('passes on an UptimeRobot status page', () => {
    assert.deepEqual(
      statusPageProblems(
        "export const STATUS_PAGE_URL: string = 'https://stats.uptimerobot.com/AbC123';",
      ),
      [],
    );
  });
});

// Freeze check 13 (E20): the /motor numbers must come from the current golden inputs.
describe('inputsHashProblems', () => {
  const hash = 'a'.repeat(64);
  const stats = `export const ENGINE_STATS = {\n  inputsHash: '${hash}',\n} as const;\n`;

  it('passes when the pinned hash is the current one', () => {
    assert.deepEqual(inputsHashProblems(stats, hash), []);
  });

  it('fails when a golden input changed, or the hash is missing', () => {
    assert.equal(inputsHashProblems(stats, 'b'.repeat(64)).length, 1);
    assert.equal(inputsHashProblems('export const ENGINE_STATS = {};', hash).length, 1);
  });
});

// Freeze check 14 (E20): no README placeholder (GIF, video and demo links) survives the freeze.
describe('readmeProblems', () => {
  it('flags TODO(E2x) markers, "em breve" and "coming soon", with the line number', () => {
    const src = 'ok\n> _GIF: em breve._\n<!-- TODO(E21): GIF -->\n- Video: _coming soon_\n';
    assert.deepEqual(
      readmeProblems('README.md', src).map((p) => p.split(':').slice(0, 2).join(':')),
      ['README.md:2', 'README.md:3', 'README.md:4'],
    );
  });

  it('passes on a finished README', () => {
    assert.deepEqual(readmeProblems('README.md', '# Refund\n\n![demo](demo.gif)\n'), []);
  });
});

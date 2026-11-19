import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contactProblems, statusPageProblems } from '../freeze-check.ts';

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

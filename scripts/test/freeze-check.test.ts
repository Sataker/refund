import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contactProblems } from '../freeze-check.ts';

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

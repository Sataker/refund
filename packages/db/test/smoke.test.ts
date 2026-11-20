import { describe, expect, it } from 'vitest';
import { EXPECTED_MIGRATIONS, PACKAGE_NAME, schema } from '../src/index.ts';

describe('@refund/db', () => {
  it('exposes its public API entry point', () => {
    expect(PACKAGE_NAME).toBe('@refund/db');
    expect(EXPECTED_MIGRATIONS).toBe(6); // 0005: E21 CNPJ sources enum
    expect(Object.keys(schema)).toContain('waitlist');
  });
});

import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../src/index.ts';

describe('@refund/engine', () => {
  it('exposes its public API entry point', () => {
    expect(PACKAGE_NAME).toBe('@refund/engine');
  });
});

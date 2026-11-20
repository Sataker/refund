import { describe, expect, it } from 'vitest';
import { formatBrtDate } from './date';

describe('formatBrtDate (M7)', () => {
  it('formats the instant in Brasília time, not the UTC day of the ISO string', () => {
    // 01h UTC on the 17th is still 22h of the 16th in São Paulo.
    expect(formatBrtDate('2026-11-17T01:00:00.000Z')).toBe('16/11/2026');
    expect(formatBrtDate('2026-11-16T12:00:00.000Z')).toBe('16/11/2026');
    expect(formatBrtDate(new Date('2026-12-31T23:30:00-03:00'))).toBe('31/12/2026');
  });

  it('returns an empty string for something that is not a date', () => {
    expect(formatBrtDate('não é data')).toBe('');
  });
});

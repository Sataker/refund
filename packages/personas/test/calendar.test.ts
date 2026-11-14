import { describe, expect, it } from 'vitest';
import {
  addMonths,
  businessDayOnOrAfter,
  businessDayOnOrBefore,
  dayOfWeek,
  nthBusinessDay,
} from '../src/calendar.ts';
import { createPrng } from '../src/prng.ts';

describe('calendar without Date', () => {
  it('knows the weekday', () => {
    expect(dayOfWeek(2026, 11, 14)).toBe(6); // Saturday
    expect(dayOfWeek(2025, 11, 20)).toBe(4); // Thursday
    expect(dayOfWeek(2024, 2, 29)).toBe(4);
  });

  it('skips weekends and bank holidays', () => {
    expect(businessDayOnOrBefore('2025-11', 20)).toBe('2025-11-19'); // 20/11 is a holiday
    expect(businessDayOnOrBefore('2025-12', 20)).toBe('2025-12-19'); // Saturday
    expect(businessDayOnOrAfter('2026-02', 16)).toBe('2026-02-18'); // Carnival
    expect(nthBusinessDay('2026-01', 5)).toBe('2026-01-08'); // 01/01 holiday, weekend 3–4
  });

  it('adds months across years', () => {
    expect(addMonths('2025-11', -1)).toBe('2025-10');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 1)).toBe('2026-01');
  });
});

describe('seeded PRNG', () => {
  it('is reproducible and seed-dependent', () => {
    const a = createPrng(1);
    const b = createPrng(1);
    const c = createPrng(2);
    const seq = (p: typeof a) => [p.next(), p.int(0, 9), p.uuid()];
    const first = seq(a);
    expect(seq(b)).toEqual(first);
    expect(seq(c)).not.toEqual(first);
  });

  it('draws uuids in the v4 layout', () => {
    expect(createPrng(42).uuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

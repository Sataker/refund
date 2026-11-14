// Seeded PRNG (mulberry32). The generator must be byte-for-byte deterministic: no Math.random,
// no clock (TESTS §3.3).

export interface Prng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Lowercase hex string of `length` characters. */
  hex(length: number): string;
  /** Pluggy-style id (UUID v4 layout). */
  uuid(): string;
}

export function createPrng(seed: number): Prng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const hex = (length: number): string => {
    let out = '';
    for (let i = 0; i < length; i++) out += int(0, 15).toString(16);
    return out;
  };
  const uuid = (): string => {
    const variant = (8 + int(0, 3)).toString(16);
    return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
  };
  return { next, int, hex, uuid };
}

import { describe, expect, it } from 'vitest';
import { curveDomain } from './optimizer-curve';

// UX review G2 H3: the chart's x window around the recommended P*, never wider than the engine's grid.

describe('curveDomain', () => {
  const grid = [162_100, 200_000, 300_000, 500_000, 800_000];

  it('0,5× to 1,25× the recommended P*, clamped to the grid', () => {
    expect(curveDomain(grid, 226_000, [162_100, 226_000])).toEqual([162_100, 282_500]);
    expect(curveDomain([0, 1_000_000], 400_000, [400_000])).toEqual([200_000, 500_000]);
  });

  it('widens to keep "hoje" and the slider P* inside', () => {
    expect(curveDomain([0, 1_000_000], 400_000, [100_000, 700_000])).toEqual([100_000, 700_000]);
  });

  it('without a positive P*, the whole grid', () => {
    expect(curveDomain(grid, 0, [])).toEqual([162_100, 800_000]);
  });
});

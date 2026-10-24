import { describe, expect, it } from 'vitest';
import { scale } from '../src/ui/DayColumns';

const MIN = 60_000;
const H = 60 * MIN;

describe('day columns scale', () => {
  it.each([
    [0, 15 * MIN, 15 * MIN],
    [50 * MIN, 15 * MIN, 60 * MIN],
    [3 * H + 20 * MIN, H, 4 * H],
    [4 * H + 10 * MIN, H, 5 * H],
    [9 * H, 2 * H, 10 * H],
  ])('max %i ms gets step %i and top %i', (max, step, top) => {
    expect(scale(max)).toEqual({ step, top });
  });

  it('always puts the top tick above the maximum, with at most six ticks', () => {
    for (let max = 0; max <= 16 * H; max += 7 * MIN) {
      const { step, top } = scale(max);
      expect(top).toBeGreaterThan(max);
      expect(top / step + 1).toBeLessThanOrEqual(6);
    }
  });
});

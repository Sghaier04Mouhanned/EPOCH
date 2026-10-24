import { describe, expect, it } from 'vitest';
import { hourWindow, level } from '../src/ui/Heatmap';

const empty = () => Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

describe('heatmap', () => {
  it('trims to the hours with focus, keeping at least eight', () => {
    const m = empty();
    m[0]![9] = 1;
    m[4]![21] = 1;
    expect(hourWindow(m)).toEqual({ from: 9, to: 22 });
    const narrow = empty();
    narrow[2]![10] = 1;
    expect(hourWindow(narrow)).toEqual({ from: 10, to: 18 });
    expect(hourWindow(empty())).toEqual({ from: 8, to: 16 });
  });

  it('widens backwards at the end of the day', () => {
    const m = empty();
    m[0]![23] = 1;
    expect(hourWindow(m)).toEqual({ from: 16, to: 24 });
  });

  it('steps each cell by its share of the busiest one', () => {
    expect([0, 1, 25, 26, 50, 75, 100].map((v) => level(v, 100))).toEqual([0, 1, 1, 2, 2, 3, 4]);
    expect(level(5, 0)).toBe(0);
  });
});

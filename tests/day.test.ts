import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../src/engine/pomodoro';
import { addDays, dailyTotals, startOfDay, streakDays, summarizeDay } from '../src/stats/day';

const MIN = 60_000;
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).getTime();

function focus(startedAt: number, actualMin = 25, completed = true): SessionRecord {
  return { phase: 'focus', startedAt, endedAt: startedAt + actualMin * MIN, plannedMs: 25 * MIN, actualMs: actualMin * MIN, completed };
}

describe('days', () => {
  it('finds local midnight and steps whole days', () => {
    const t = at(2026, 10, 24, 15, 30);
    expect(startOfDay(t)).toBe(at(2026, 10, 24, 0));
    expect(addDays(t, -1)).toBe(at(2026, 10, 23, 0));
    // Across the end of daylight saving time (a 25-hour day in many zones).
    expect(addDays(at(2026, 10, 24), 2)).toBe(at(2026, 10, 26, 0));
  });
});

describe('summarizeDay', () => {
  it('counts focus time including sessions stopped early, and ignores breaks', () => {
    const brk: SessionRecord = { ...focus(at(2026, 10, 24, 11), 5), phase: 'shortBreak', plannedMs: 5 * MIN };
    const summary = summarizeDay([focus(at(2026, 10, 24, 9)), focus(at(2026, 10, 24, 10), 12, false), brk], 7 * MIN);
    expect(summary).toEqual({ focusedMs: (25 + 12 + 7) * MIN, completed: 1, stoppedEarly: 1 });
  });

  it('is all zeros for an empty day', () => {
    expect(summarizeDay([])).toEqual({ focusedMs: 0, completed: 0, stoppedEarly: 0 });
  });
});

describe('streakDays', () => {
  const now = at(2026, 10, 24, 18);

  it('counts consecutive days ending today', () => {
    const sessions = [focus(at(2026, 10, 24)), focus(at(2026, 10, 23)), focus(at(2026, 10, 22)), focus(at(2026, 10, 20))];
    expect(streakDays(sessions, now)).toBe(3);
  });

  it('keeps yesterday’s streak alive while today has nothing yet', () => {
    expect(streakDays([focus(at(2026, 10, 23)), focus(at(2026, 10, 22))], now)).toBe(2);
  });

  it('needs a completed focus session; stopped-early ones and breaks do not count', () => {
    expect(streakDays([focus(at(2026, 10, 24), 10, false)], now)).toBe(0);
  });

  it('is zero after a missed day', () => {
    expect(streakDays([focus(at(2026, 10, 22))], now)).toBe(0);
  });
});

describe('dailyTotals', () => {
  it('sums focus per day, fills empty days with zero and takes today from the caller', () => {
    const now = at(2026, 10, 24, 18);
    const sessions = [focus(at(2026, 10, 22, 9)), focus(at(2026, 10, 22, 10), 12, false), focus(at(2026, 10, 24, 9))];
    const totals = dailyTotals(sessions, now, 3, 99 * MIN);
    expect(totals).toEqual([
      { day: at(2026, 10, 22, 0), focusedMs: 37 * MIN },
      { day: at(2026, 10, 23, 0), focusedMs: 0 },
      { day: at(2026, 10, 24, 0), focusedMs: 99 * MIN },
    ]);
  });
});

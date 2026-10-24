import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../src/engine/pomodoro';
import { summarizeDay } from '../src/stats/day';
import { computeRange, longestStreak, mondayFirst } from '../src/stats/range';

const MIN = 60_000;
const at = (m: number, d: number, h = 10, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const NOW = at(10, 24, 18); // Saturday 24 October 2026

function focus(startedAt: number, actualMin = 25, completed = true, pausedMin = 0): SessionRecord {
  return {
    phase: 'focus',
    startedAt,
    endedAt: startedAt + (actualMin + pausedMin) * MIN,
    plannedMs: 25 * MIN,
    actualMs: actualMin * MIN,
    completed,
  };
}

/** What the screen does: today's figure comes from the same day summary as the Timer screen. */
function stats(sessions: SessionRecord[], rangeDays: number, liveMs = 0) {
  const today = sessions.filter((s) => s.startedAt >= at(10, 24, 0));
  return computeRange(sessions, NOW, rangeDays, summarizeDay(today, liveMs).focusedMs);
}

describe('computeRange', () => {
  it('totals the range, live session included, and the totals agree with the days', () => {
    const sessions = [focus(at(10, 20)), focus(at(10, 22)), focus(at(10, 22, 11), 10, false), focus(at(10, 24))];
    const s = stats(sessions, 7, 5 * MIN);
    expect(s.focusedMs).toBe((25 + 25 + 10 + 25 + 5) * MIN);
    expect(s.days.reduce((sum, d) => sum + d.focusedMs, 0)).toBe(s.focusedMs);
    expect(s).toMatchObject({ completed: 3, stoppedEarly: 1, activeDays: 3 });
  });

  it('averages only over the days since history began', () => {
    const s = stats([focus(at(10, 23)), focus(at(10, 24))], 30);
    expect(s.countedDays).toBe(2);
    expect(s.dailyAverageMs).toBe(25 * MIN);
    expect(s.previous).toBeUndefined(); // nothing to compare with
  });

  it('compares with the same length of time just before the range', () => {
    const sessions = [focus(at(10, 10)), focus(at(10, 11)), focus(at(10, 20))];
    const s = stats(sessions, 7); // range 18-24 Oct, previous 11-17 Oct
    expect(s.previous).toEqual({ focusedMs: 25 * MIN, completed: 1, dailyAverageMs: Math.round((25 * MIN) / 7) });
  });

  it('averages each weekday over the days of that weekday in the range', () => {
    // Two Mondays in a 14-day range (12 and 19 Oct): one with 50 m, one empty.
    const s = stats([focus(at(10, 12), 25), focus(at(10, 12, 11), 25), focus(at(10, 11))], 14);
    const monday = s.weekdays[0]!;
    expect(monday).toEqual({ weekday: 1, averageMs: 25 * MIN, count: 2 });
    expect(s.weekdays.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('spreads a session across the hours it ran in, pauses stretching it', () => {
    // 10:50 to 11:30 wall time (30 m focus + 10 m pause): 10 m of 40 go to 10:00, 30 m to 11:00.
    const s = stats([focus(at(10, 24, 10, 50), 30, true, 10)], 7);
    const saturday = s.matrix[mondayFirst(6)]!;
    expect(saturday[10]).toBeCloseTo(7.5 * MIN);
    expect(saturday[11]).toBeCloseTo(22.5 * MIN);
    expect(s.matrix.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(30 * MIN);
  });

  it('finds the best day and the average session', () => {
    const s = stats([focus(at(10, 21)), focus(at(10, 21, 11)), focus(at(10, 23), 10, false)], 7);
    expect(s.bestDay).toEqual({ day: at(10, 21, 0), focusedMs: 50 * MIN });
    expect(s.averageSessionMs).toBe(20 * MIN);
  });

  it('is all zeros with no history', () => {
    const s = stats([], 30);
    expect(s).toMatchObject({ focusedMs: 0, completed: 0, activeDays: 0, dailyAverageMs: 0, bestDay: undefined });
    expect(s.days).toHaveLength(30);
  });
});

describe('longestStreak', () => {
  it('finds the longest run of days ever, not just the current one', () => {
    const days = [1, 2, 3, 4, 10, 11, 23, 24].map((d) => focus(at(10, d)));
    expect(longestStreak(days)).toBe(4);
  });

  it('ignores stopped-early sessions', () => {
    expect(longestStreak([focus(at(10, 1)), focus(at(10, 2), 5, false)])).toBe(1);
  });
});

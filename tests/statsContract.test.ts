// Contract with the Python report (tools/src/epoch_tools/stats.py): both must
// compute the same figures from the sample history. The expected file is
// written by `epoch-stats fixtures/sample-backup.json --today 2026-10-24 --utc
// --json` and checked by the Python tests too, so neither side can drift.

import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBackup } from '../src/storage/backup';
import { startOfDay, summarizeDay } from '../src/stats/day';
import { computeRange, type RangeStats } from '../src/stats/range';

const read = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

interface Expected {
  days: number;
  focusedMs: number;
  completed: number;
  stoppedEarly: number;
  activeDays: number;
  countedDays: number;
  dailyAverageMs: number;
  currentStreak: number;
  longestStreak: number;
  averageSessionMs: number;
  bestDay: { date: string; focusedMs: number } | null;
  weekdayAverageMs: number[];
  hourMs: number[];
}

describe('stats contract with the Python report', () => {
  const expected = JSON.parse(read('sample-stats-30d.json')) as Expected;
  let stats: RangeStats;

  beforeAll(() => {
    // Read the sample's times in UTC, as the Python side does with --utc.
    process.env.TZ = 'UTC';
    const parsed = parseBackup(read('sample-backup.json'));
    if (!parsed.ok) throw new Error(parsed.error);
    const now = Date.UTC(2026, 9, 24, 23, 59);
    const today = parsed.sessions.filter((s) => s.startedAt >= startOfDay(now));
    stats = computeRange(parsed.sessions, now, expected.days, summarizeDay(today).focusedMs);
  });

  it('agrees on every headline figure', () => {
    expect({
      focusedMs: stats.focusedMs,
      completed: stats.completed,
      stoppedEarly: stats.stoppedEarly,
      activeDays: stats.activeDays,
      countedDays: stats.countedDays,
      dailyAverageMs: stats.dailyAverageMs,
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      averageSessionMs: stats.averageSessionMs,
    }).toEqual({
      focusedMs: expected.focusedMs,
      completed: expected.completed,
      stoppedEarly: expected.stoppedEarly,
      activeDays: expected.activeDays,
      countedDays: expected.countedDays,
      dailyAverageMs: expected.dailyAverageMs,
      currentStreak: expected.currentStreak,
      longestStreak: expected.longestStreak,
      averageSessionMs: expected.averageSessionMs,
    });
  });

  it('agrees on the best day and the weekday averages', () => {
    expect(stats.bestDay && { date: new Date(stats.bestDay.day).toISOString().slice(0, 10), focusedMs: stats.bestDay.focusedMs }).toEqual(
      expected.bestDay,
    );
    expect(stats.weekdays.map((w) => w.averageMs)).toEqual(expected.weekdayAverageMs);
  });

  it('agrees on focus time per hour of day, to the millisecond', () => {
    const hours = Array.from({ length: 24 }, (_, h) => stats.matrix.reduce((sum, row) => sum + row[h]!, 0));
    hours.forEach((ms, h) => expect(Math.abs(ms - expected.hourMs[h]!)).toBeLessThanOrEqual(1));
  });
});

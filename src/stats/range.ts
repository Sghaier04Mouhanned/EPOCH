// Figures for the Stats screen over the last N days. Pure: everything is
// computed from the session list and `now`, so every number on the screen
// can be checked against the rows it came from.

import type { SessionRecord } from '../engine/pomodoro';
import { addDays, dailyTotals, startOfDay, streakDays, type DayTotal } from './day';

export interface PeriodTotals {
  focusedMs: number;
  completed: number;
  /** Focus per day, averaged over the days the period could have had sessions. */
  dailyAverageMs: number;
}

export interface RangeStats extends PeriodTotals {
  days: DayTotal[];
  stoppedEarly: number;
  /** Days in the range with any focus time. */
  activeDays: number;
  /** Days the average is taken over: the range, or fewer if history starts inside it. */
  countedDays: number;
  /** The same length of time just before the range; undefined when history starts inside the range. */
  previous?: PeriodTotals;
  /** Average focus per day by weekday, Monday first. */
  weekdays: { weekday: number; averageMs: number; count: number }[];
  /** Focus time by weekday (rows, Monday first) and hour of day (columns). */
  matrix: number[][];
  bestDay?: DayTotal;
  averageSessionMs: number;
  currentStreak: number;
  longestStreak: number;
}

/** Monday-first row index for a JS weekday (0 = Sunday). */
export const mondayFirst = (weekday: number) => (weekday + 6) % 7;

export function computeRange(
  sessions: SessionRecord[],
  now: number,
  rangeDays: number,
  todayFocusedMs: number,
): RangeStats {
  const today = startOfDay(now);
  const from = addDays(today, -(rangeDays - 1));
  const focus = sessions.filter((s) => s.phase === 'focus');
  const inRange = focus.filter((s) => s.startedAt >= from);

  const firstEver = focus.length ? startOfDay(Math.min(...focus.map((s) => s.startedAt))) : today;
  const countFrom = Math.max(from, firstEver);
  const countedDays = Math.max(1, daysBetween(countFrom, today) + 1);

  const days = dailyTotals(focus, now, rangeDays, todayFocusedMs);
  const focusedMs = days.reduce((sum, d) => sum + d.focusedMs, 0);
  const completed = inRange.filter((s) => s.completed).length;
  const stoppedEarly = inRange.length - completed;

  let previous: PeriodTotals | undefined;
  if (firstEver < from) {
    const prevFrom = addDays(from, -rangeDays);
    const prev = focus.filter((s) => s.startedAt >= prevFrom && s.startedAt < from);
    const prevFocused = prev.reduce((sum, s) => sum + s.actualMs, 0);
    const prevDays = daysBetween(Math.max(prevFrom, firstEver), from);
    previous = {
      focusedMs: prevFocused,
      completed: prev.filter((s) => s.completed).length,
      dailyAverageMs: Math.round(prevFocused / Math.max(1, prevDays)),
    };
  }

  const counted = days.filter((d) => d.day >= countFrom);
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const matching = counted.filter((d) => new Date(d.day).getDay() === weekday);
    const total = matching.reduce((sum, d) => sum + d.focusedMs, 0);
    return { weekday, averageMs: matching.length ? Math.round(total / matching.length) : 0, count: matching.length };
  });

  const matrix = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const s of inRange) spreadOverHours(s, matrix);

  const bestDay = days.reduce<DayTotal | undefined>(
    (best, d) => (d.focusedMs > 0 && (!best || d.focusedMs > best.focusedMs) ? d : best),
    undefined,
  );

  return {
    days,
    focusedMs,
    completed,
    stoppedEarly,
    activeDays: days.filter((d) => d.focusedMs > 0).length,
    countedDays,
    dailyAverageMs: Math.round(focusedMs / countedDays),
    previous,
    weekdays,
    matrix,
    bestDay,
    averageSessionMs: inRange.length ? Math.round(inRange.reduce((sum, s) => sum + s.actualMs, 0) / inRange.length) : 0,
    currentStreak: streakDays(sessions, now),
    longestStreak: longestStreak(sessions),
  };
}

/** Whole local days from one midnight to another (DST-safe). */
function daysBetween(fromDay: number, toDay: number): number {
  let n = 0;
  for (let d = fromDay; d < toDay; d = addDays(d, 1)) n += 1;
  return n;
}

/**
 * Add a session's focus time to the hours it ran in. Pauses stretch the wall
 * time, so the counted time is spread in proportion across that span.
 */
function spreadOverHours(s: SessionRecord, matrix: number[][]) {
  const span = s.endedAt - s.startedAt;
  if (span <= 0 || s.actualMs <= 0) return;
  let t = s.startedAt;
  while (t < s.endedAt) {
    const d = new Date(t);
    const hourEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
    const sliceEnd = Math.min(hourEnd, s.endedAt);
    matrix[mondayFirst(d.getDay())]![d.getHours()]! += ((sliceEnd - t) / span) * s.actualMs;
    t = sliceEnd;
  }
}

/** The longest run of consecutive days with a completed focus session, ever. */
export function longestStreak(sessions: SessionRecord[]): number {
  const days = [...new Set(sessions.filter((s) => s.phase === 'focus' && s.completed).map((s) => startOfDay(s.startedAt)))].sort(
    (a, b) => a - b,
  );
  let best = 0;
  let run = 0;
  let prev: number | undefined;
  for (const day of days) {
    run = prev !== undefined && addDays(prev, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}

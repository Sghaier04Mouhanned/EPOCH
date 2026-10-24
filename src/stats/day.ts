// Day-level figures: today's focus total, completed sessions and the streak.
// Days are local calendar days, so a session at 23:50 counts for that evening.

import type { SessionRecord } from '../engine/pomodoro';

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The local midnight `days` days after the one containing `t` (DST-safe). */
export function addDays(t: number, days: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export interface DaySummary {
  /** Focus time actually counted down, including sessions stopped early. */
  focusedMs: number;
  completed: number;
  stoppedEarly: number;
}

/**
 * Sum one day's sessions. `liveFocusMs` is the elapsed time of a focus
 * session still running, so the total moves while you work.
 */
export function summarizeDay(sessions: SessionRecord[], liveFocusMs = 0): DaySummary {
  let focusedMs = liveFocusMs;
  let completed = 0;
  let stoppedEarly = 0;
  for (const s of sessions) {
    if (s.phase !== 'focus') continue;
    focusedMs += s.actualMs;
    if (s.completed) completed += 1;
    else stoppedEarly += 1;
  }
  return { focusedMs, completed, stoppedEarly };
}

/**
 * Consecutive days, ending today, with at least one completed focus session.
 * A day not finished yet doesn't break the streak: with nothing done today,
 * the count runs back from yesterday.
 */
export function streakDays(sessions: SessionRecord[], now: number): number {
  const days = new Set<number>();
  for (const s of sessions) if (s.phase === 'focus' && s.completed) days.add(startOfDay(s.startedAt));

  let day = startOfDay(now);
  if (!days.has(day)) day = addDays(day, -1);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

export interface DayTotal {
  day: number;
  focusedMs: number;
}

/**
 * Focus time per local day for the `days` days ending today, oldest first.
 * Today's figure is passed in (`todayFocusedMs`) so it is the same number the
 * screen shows elsewhere, live session included.
 */
export function dailyTotals(sessions: SessionRecord[], now: number, days: number, todayFocusedMs: number): DayTotal[] {
  const today = startOfDay(now);
  const totals = new Map<number, number>();
  for (const s of sessions) {
    if (s.phase !== 'focus') continue;
    const day = startOfDay(s.startedAt);
    totals.set(day, (totals.get(day) ?? 0) + s.actualMs);
  }
  const out: DayTotal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    out.push({ day, focusedMs: day === today ? todayFocusedMs : (totals.get(day) ?? 0) });
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, initialState, reduce, type PomodoroState } from '../src/engine/pomodoro';
import { upcoming } from '../src/engine/schedule';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const S = DEFAULT_SETTINGS;

describe('upcoming', () => {
  it('projects from now when idle, alternating focus and short breaks', () => {
    const plan = upcoming(initialState(S), S, T0, 4);
    expect(plan.map((p) => [p.phase, p.focusNumber])).toEqual([
      ['focus', 1],
      ['shortBreak', undefined],
      ['focus', 2],
      ['shortBreak', undefined],
    ]);
    expect(plan[0]).toMatchObject({ startsAt: T0, endsAt: T0 + 25 * MIN });
    expect(plan[3]).toMatchObject({ startsAt: T0 + 55 * MIN, endsAt: T0 + 60 * MIN });
  });

  it('keeps the real start and end of a running phase', () => {
    const running = reduce(initialState(S), { type: 'start', now: T0 }, S).state;
    const [current, next] = upcoming(running, S, T0 + 10 * MIN, 2);
    expect(current).toMatchObject({ startsAt: T0, endsAt: T0 + 25 * MIN });
    expect(next).toMatchObject({ phase: 'shortBreak', startsAt: T0 + 25 * MIN });
  });

  it('moves the projected end while paused', () => {
    let state = reduce(initialState(S), { type: 'start', now: T0 }, S).state;
    state = reduce(state, { type: 'pause', now: T0 + 10 * MIN }, S).state;
    const [current] = upcoming(state, S, T0 + 30 * MIN, 1);
    expect(current?.endsAt).toBe(T0 + 45 * MIN); // 15 minutes left, counted from now
  });

  it('puts the long break after the last focus of the cycle and restarts the count', () => {
    const third: PomodoroState = { phase: 'focus', countdown: { status: 'idle', durationMs: 25 * MIN }, completedInCycle: 3 };
    const plan = upcoming(third, S, T0, 4);
    expect(plan.map((p) => [p.phase, p.focusNumber])).toEqual([
      ['focus', 4],
      ['longBreak', undefined],
      ['focus', 1],
      ['shortBreak', undefined],
    ]);
  });
});

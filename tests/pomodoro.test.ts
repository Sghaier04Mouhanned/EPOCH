import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  applySettings,
  initialState,
  reduce,
  type Action,
  type PomodoroState,
  type SessionRecord,
  type Settings,
} from '../src/engine/pomodoro';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const S: Settings = { ...DEFAULT_SETTINGS }; // 25 / 5 / 15, long break every 4

/** Apply actions in order, collecting every emitted record. */
function run(state: PomodoroState, actions: Action[], settings = S) {
  const records: SessionRecord[] = [];
  for (const action of actions) {
    const t = reduce(state, action, settings);
    state = t.state;
    if (t.record) records.push(t.record);
  }
  return { state, records };
}

/** Start the current phase at `at` and tick past its end. Returns the end time. */
function completePhase(state: PomodoroState, at: number, settings = S) {
  const started = reduce(state, { type: 'start', now: at }, settings).state;
  const endsAt = (started.countdown as { endsAt: number }).endsAt;
  const t = reduce(started, { type: 'tick', now: endsAt }, settings);
  return { state: t.state, record: t.record!, endsAt };
}

describe('pomodoro', () => {
  it('starts idle on a focus phase with the focus duration', () => {
    expect(initialState(S)).toEqual({
      phase: 'focus',
      countdown: { status: 'idle', durationMs: 25 * MIN },
      completedInCycle: 0,
    });
  });

  it('does nothing on a tick before the end', () => {
    const running = reduce(initialState(S), { type: 'start', now: T0 }, S).state;
    const t = reduce(running, { type: 'tick', now: T0 + 10 * MIN }, S);
    expect(t.state).toBe(running);
    expect(t.record).toBeUndefined();
  });

  it('completes a focus session and moves to an idle short break', () => {
    const { state, record } = completePhase(initialState(S), T0);
    expect(record).toEqual({
      phase: 'focus',
      startedAt: T0,
      endedAt: T0 + 25 * MIN,
      plannedMs: 25 * MIN,
      actualMs: 25 * MIN,
      completed: true,
    });
    expect(state).toEqual({
      phase: 'shortBreak',
      countdown: { status: 'idle', durationMs: 5 * MIN },
      completedInCycle: 1,
    });
  });

  it('gives a long break after every 4th focus session, then resets the cycle', () => {
    let state = initialState(S);
    let at = T0;
    const phases: string[] = [];
    for (let i = 0; i < 9; i++) {
      const r = completePhase(state, at);
      phases.push(r.record.phase);
      state = r.state;
      at = r.endsAt;
    }
    expect(phases).toEqual([
      'focus', 'shortBreak', 'focus', 'shortBreak', 'focus', 'shortBreak', 'focus', 'longBreak', 'focus',
    ]);
    // After the long break the counter restarts; one focus done since then.
    expect(state.completedInCycle).toBe(1);
    expect(state.phase).toBe('shortBreak');
  });

  it('records the scheduled end time when the tick arrives late', () => {
    const running = reduce(initialState(S), { type: 'start', now: T0 }, S).state;
    const t = reduce(running, { type: 'tick', now: T0 + 26 * MIN }, S);
    expect(t.record?.endedAt).toBe(T0 + 25 * MIN);
  });

  it('excludes paused time from actualMs', () => {
    const { records } = run(initialState(S), [
      { type: 'start', now: T0 },
      { type: 'pause', now: T0 + 10 * MIN },
      { type: 'resume', now: T0 + 40 * MIN }, // 30 minutes away
      { type: 'tick', now: T0 + 55 * MIN },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ actualMs: 25 * MIN, startedAt: T0, endedAt: T0 + 55 * MIN, completed: true });
  });

  describe('auto-start', () => {
    const auto: Settings = { ...S, autoStartBreaks: true, autoStartFocus: true };

    it('starts the next phase exactly where the last one ended', () => {
      const running = reduce(initialState(auto), { type: 'start', now: T0 }, auto).state;
      const t = reduce(running, { type: 'tick', now: T0 + 25 * MIN + 3_000 }, auto);
      expect(t.state.phase).toBe('shortBreak');
      expect(t.state.countdown).toEqual({
        status: 'running',
        durationMs: 5 * MIN,
        startedAt: T0 + 25 * MIN,
        endsAt: T0 + 30 * MIN,
      });
    });

    it('stays idle if the auto-started phase would already be over (laptop slept)', () => {
      const running = reduce(initialState(auto), { type: 'start', now: T0 }, auto).state;
      const t = reduce(running, { type: 'tick', now: T0 + 3 * 60 * MIN }, auto);
      expect(t.record?.phase).toBe('focus');
      expect(t.state.phase).toBe('shortBreak');
      expect(t.state.countdown.status).toBe('idle');
    });

    it('only auto-starts the phase kinds that are enabled', () => {
      const breaksOnly: Settings = { ...S, autoStartBreaks: true };
      const afterFocus = completePhase(initialState(breaksOnly), T0, breaksOnly);
      expect(afterFocus.state.countdown.status).toBe('running');

      const afterBreak = reduce(
        afterFocus.state,
        { type: 'tick', now: afterFocus.endsAt + 5 * MIN },
        breaksOnly,
      );
      expect(afterBreak.state.phase).toBe('focus');
      expect(afterBreak.state.countdown.status).toBe('idle');
    });
  });

  describe('skip', () => {
    it('records a started focus as incomplete and does not count it toward the cycle', () => {
      const { state, records } = run(initialState(S), [
        { type: 'start', now: T0 },
        { type: 'skip', now: T0 + 10 * MIN },
      ]);
      expect(records).toEqual([
        { phase: 'focus', startedAt: T0, endedAt: T0 + 10 * MIN, plannedMs: 25 * MIN, actualMs: 10 * MIN, completed: false },
      ]);
      expect(state).toMatchObject({ phase: 'shortBreak', completedInCycle: 0, countdown: { status: 'idle' } });
    });

    it('moves on without a record when nothing was started', () => {
      const t = reduce(initialState(S), { type: 'skip', now: T0 }, S);
      expect(t.record).toBeUndefined();
      expect(t.state.phase).toBe('shortBreak');
    });

    it('resets the cycle when a long break is skipped', () => {
      const atLongBreak: PomodoroState = {
        phase: 'longBreak',
        countdown: { status: 'idle', durationMs: 15 * MIN },
        completedInCycle: 4,
      };
      const t = reduce(atLongBreak, { type: 'skip', now: T0 }, S);
      expect(t.state).toMatchObject({ phase: 'focus', completedInCycle: 0 });
    });
  });

  describe('reset', () => {
    it('returns to the start of the same phase and records the partial session', () => {
      const { state, records } = run(initialState(S), [
        { type: 'start', now: T0 },
        { type: 'pause', now: T0 + 7 * MIN },
        { type: 'reset', now: T0 + 9 * MIN },
      ]);
      expect(state).toEqual(initialState(S));
      expect(records[0]).toMatchObject({ actualMs: 7 * MIN, completed: false, endedAt: T0 + 9 * MIN });
    });

    it('records nothing when reset while idle', () => {
      expect(reduce(initialState(S), { type: 'reset', now: T0 }, S).record).toBeUndefined();
    });
  });

  describe('a countdown that already reached zero', () => {
    const running = reduce(initialState(S), { type: 'start', now: T0 }, S).state;
    const late = T0 + 25 * MIN + 500;

    it.each(['pause', 'skip', 'reset'] as const)('completes instead of applying %s', (type) => {
      const t = reduce(running, { type, now: late }, S);
      expect(t.record).toMatchObject({ phase: 'focus', completed: true, actualMs: 25 * MIN });
      expect(t.state).toMatchObject({ phase: 'shortBreak', completedInCycle: 1 });
    });
  });

  describe('applySettings', () => {
    it('updates an idle countdown to the new duration', () => {
      const next = applySettings(initialState(S), { ...S, focusMinutes: 50 });
      expect(next.countdown).toEqual({ status: 'idle', durationMs: 50 * MIN });
    });

    it('leaves a started countdown at its planned length', () => {
      const running = reduce(initialState(S), { type: 'start', now: T0 }, S).state;
      expect(applySettings(running, { ...S, focusMinutes: 50 })).toBe(running);
    });
  });

  it('keeps state JSON-serialisable so it can be persisted and restored', () => {
    const running = reduce(initialState(S), { type: 'start', now: T0 }, S).state;
    const restored = JSON.parse(JSON.stringify(running)) as PomodoroState;
    const t = reduce(restored, { type: 'tick', now: T0 + 25 * MIN }, S);
    expect(t.record?.completed).toBe(true);
  });
});

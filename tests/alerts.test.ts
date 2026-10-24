import { describe, expect, it } from 'vitest';
import { alertMessage, claimOnce, shouldAlert, type LockManagerLike } from '../src/alerts/logic';
import { DEFAULT_SETTINGS, type PomodoroState, type SessionRecord } from '../src/engine/pomodoro';
import { memoryStorage } from '../src/storage/kv';

const MIN = 60_000;
const S = DEFAULT_SETTINGS;

const record = (phase: SessionRecord['phase'], completed = true): SessionRecord => ({
  phase,
  startedAt: 0,
  endedAt: 25 * MIN,
  plannedMs: 25 * MIN,
  actualMs: completed ? 25 * MIN : 10 * MIN,
  completed,
});

const state = (phase: PomodoroState['phase'], completedInCycle: number, running = false): PomodoroState => ({
  phase,
  completedInCycle,
  countdown: running
    ? { status: 'running', durationMs: 5 * MIN, startedAt: 0, endsAt: 5 * MIN }
    : { status: 'idle', durationMs: 5 * MIN },
});

/** Serialises callbacks like the real Web Locks API does for one lock name. */
function fakeLocks(): LockManagerLike {
  let queue = Promise.resolve<unknown>(undefined);
  return {
    request(_name, callback) {
      const run = queue.then(callback);
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

describe('shouldAlert', () => {
  it('alerts for a phase that ran to zero, noticed in time', () => {
    expect(shouldAlert(record('focus'), 40_000)).toBe(true);
  });

  it('stays quiet for skips and resets, and for ends noticed long after (sleep)', () => {
    expect(shouldAlert(record('focus', false), 0)).toBe(false);
    expect(shouldAlert(record('focus'), 10 * MIN)).toBe(false);
  });
});

describe('claimOnce', () => {
  it('lets exactly one of several tabs claim the same alert', async () => {
    const storage = memoryStorage(); // shared, as localStorage is between tabs
    const locks = fakeLocks();
    const claims = await Promise.all([1, 2, 3].map(() => claimOnce('a', storage, locks)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimOnce('a', storage, locks)).toBe(false); // a tab ticking later
    expect(await claimOnce('b', storage, locks)).toBe(true); // the next alert
  });

  it('still works without Web Locks', async () => {
    const storage = memoryStorage();
    expect(await claimOnce('a', storage, undefined)).toBe(true);
    expect(await claimOnce('a', storage, undefined)).toBe(false);
  });
});

describe('alertMessage', () => {
  it('says what comes next after focus', () => {
    expect(alertMessage(record('focus'), state('shortBreak', 1), S)).toEqual({ title: 'Focus done', body: 'Time for a 5 m break.' });
    expect(alertMessage(record('focus'), state('shortBreak', 1, true), S).body).toBe('Your 5 m break has started.');
    expect(alertMessage(record('focus'), state('longBreak', 4), S).body).toBe('4 sessions done. Time for a 15 m long break.');
  });

  it('names the next focus session after a break', () => {
    expect(alertMessage(record('shortBreak'), state('focus', 2), S)).toEqual({ title: 'Break over', body: 'Ready for focus 3 of 4.' });
    expect(alertMessage(record('longBreak'), state('focus', 0, true), S).body).toBe('Focus 1 of 4 has started.');
  });
});

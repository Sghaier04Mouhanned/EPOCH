// The decisions behind end-of-phase alerts, kept free of browser APIs so they
// can be tested: whether to alert, which tab does it, and what it says.

import type { PomodoroState, SessionRecord, Settings } from '../engine/pomodoro';
import { phaseDurationMs } from '../engine/pomodoro';
import type { KeyValueStorage } from '../storage/kv';
import { formatDuration } from '../ui/format';

/** Ends noticed later than this (the laptop slept through them) get no alarm. */
export const MAX_LATE_MS = 2 * 60_000;

export const LAST_ALERT_KEY = 'epoch.lastAlert';

export interface AlertPrefs {
  sound: boolean;
  notify: boolean;
}

export const DEFAULT_ALERT_PREFS: AlertPrefs = { sound: true, notify: false };

export function shouldAlert(record: SessionRecord, lateMs: number): boolean {
  // Skips and resets also end a phase, but the person did that on purpose.
  return record.completed && lateMs <= MAX_LATE_MS;
}

/** The subset of the Web Locks API this needs; injectable for tests. */
export interface LockManagerLike {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/**
 * True for exactly one tab per alert id. The lock makes check-and-set atomic
 * across tabs; the stored id stops a tab that ticks later from alerting again.
 * Without Web Locks every tab claims, which at worst repeats the sound.
 */
export async function claimOnce(
  id: string,
  storage: KeyValueStorage,
  locks: LockManagerLike | undefined,
): Promise<boolean> {
  const checkAndSet = () => {
    if (storage.getItem(LAST_ALERT_KEY) === id) return false;
    storage.setItem(LAST_ALERT_KEY, id);
    return true;
  };
  return locks ? locks.request(LAST_ALERT_KEY, checkAndSet) : checkAndSet();
}

/** The notification text, from the phase that ended and the state it led to. */
export function alertMessage(
  ended: SessionRecord,
  next: PomodoroState,
  settings: Settings,
): { title: string; body: string } {
  const started = next.countdown.status === 'running';
  const length = formatDuration(phaseDurationMs(next.phase, settings));

  if (ended.phase === 'focus') {
    const title = 'Focus done';
    if (next.phase === 'longBreak') {
      const cycle = `${settings.longBreakEvery} sessions done.`;
      return { title, body: started ? `${cycle} Your ${length} long break has started.` : `${cycle} Time for a ${length} long break.` };
    }
    return { title, body: started ? `Your ${length} break has started.` : `Time for a ${length} break.` };
  }

  const title = 'Break over';
  const which = `focus ${next.completedInCycle + 1} of ${settings.longBreakEvery}`;
  return { title, body: started ? `${capitalise(which)} has started.` : `Ready for ${which}.` };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

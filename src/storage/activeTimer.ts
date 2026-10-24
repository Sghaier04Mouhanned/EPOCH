// Persists the in-progress timer so a refresh or reopened tab resumes it.

import type { Countdown } from '../engine/countdown';
import type { Phase, PomodoroState } from '../engine/pomodoro';
import { isFiniteNumber, isRecord, readJson, writeJson, type KeyValueStorage } from './kv';

export const ACTIVE_TIMER_KEY = 'epoch.activeTimer.v1';

const PHASES: readonly Phase[] = ['focus', 'shortBreak', 'longBreak'];

export function isPhase(x: unknown): x is Phase {
  return PHASES.includes(x as Phase);
}

function isCountdown(x: unknown): x is Countdown {
  if (!isRecord(x) || !isFiniteNumber(x.durationMs) || x.durationMs <= 0) return false;
  switch (x.status) {
    case 'idle':
      return true;
    case 'running':
      return isFiniteNumber(x.startedAt) && isFiniteNumber(x.endsAt);
    case 'paused':
      return isFiniteNumber(x.startedAt) && isFiniteNumber(x.remainingMs) && x.remainingMs >= 0;
    default:
      return false;
  }
}

export function isPomodoroState(x: unknown): x is PomodoroState {
  return (
    isRecord(x) &&
    isPhase(x.phase) &&
    Number.isInteger(x.completedInCycle) &&
    (x.completedInCycle as number) >= 0 &&
    isCountdown(x.countdown)
  );
}

/** The saved timer, or `undefined` if there is none or it is unreadable. */
export function loadActiveTimer(storage: KeyValueStorage): PomodoroState | undefined {
  const saved = readJson(storage, ACTIVE_TIMER_KEY);
  return isPomodoroState(saved) ? saved : undefined;
}

export function saveActiveTimer(storage: KeyValueStorage, state: PomodoroState): void {
  writeJson(storage, ACTIVE_TIMER_KEY, state);
}

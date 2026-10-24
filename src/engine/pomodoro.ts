// The Pomodoro cycle: focus -> short break, repeated, with a long break every
// `longBreakEvery` completed focus sessions.
//
// `reduce` is a pure function. It never reads the clock, plays sounds or
// writes storage; it returns the next state plus, when a phase ends, a
// `SessionRecord` for the caller to persist and react to (alarm, stats).

import * as countdown from './countdown';
import type { Countdown } from './countdown';

export type Phase = 'focus' | 'shortBreak' | 'longBreak';

export interface Settings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
};

export interface PomodoroState {
  phase: Phase;
  countdown: Countdown;
  /** Focus sessions completed since the last long break. */
  completedInCycle: number;
}

export interface SessionRecord {
  phase: Phase;
  startedAt: number;
  endedAt: number;
  plannedMs: number;
  /** Time actually spent counting down, excluding pauses. */
  actualMs: number;
  /** True only when the countdown ran to zero; false when skipped or reset. */
  completed: boolean;
}

export type Action =
  | { type: 'start'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'skip'; now: number }
  | { type: 'reset'; now: number };

export interface Transition {
  state: PomodoroState;
  record?: SessionRecord;
}

const MINUTE = 60_000;

/** A session stopped before this is treated as an accidental start, not history. */
export const MIN_INTERRUPTED_MS = MINUTE;

export function phaseDurationMs(phase: Phase, settings: Settings): number {
  switch (phase) {
    case 'focus':
      return settings.focusMinutes * MINUTE;
    case 'shortBreak':
      return settings.shortBreakMinutes * MINUTE;
    case 'longBreak':
      return settings.longBreakMinutes * MINUTE;
  }
}

export function initialState(settings: Settings): PomodoroState {
  return { phase: 'focus', countdown: countdown.idle(phaseDurationMs('focus', settings)), completedInCycle: 0 };
}

/** Re-derive the idle duration after settings change. A started countdown keeps its planned length. */
export function applySettings(state: PomodoroState, settings: Settings): PomodoroState {
  if (state.countdown.status !== 'idle') return state;
  const durationMs = phaseDurationMs(state.phase, settings);
  if (durationMs === state.countdown.durationMs) return state;
  return { ...state, countdown: countdown.idle(durationMs) };
}

export function reduce(state: PomodoroState, action: Action, settings: Settings): Transition {
  const c = state.countdown;
  // A countdown that has already reached zero completes first, whatever the
  // action. Otherwise a pause or skip landing between the end and the next
  // tick would freeze it at 0:00 or throw away a finished session.
  if (c.status === 'running' && countdown.isDone(c, action.now)) {
    return complete(state, c, action.now, settings);
  }
  switch (action.type) {
    case 'start':
      return { state: withCountdown(state, countdown.start(c, action.now)) };
    case 'pause':
      return { state: withCountdown(state, countdown.pause(c, action.now)) };
    case 'resume':
      return { state: withCountdown(state, countdown.resume(c, action.now)) };
    case 'tick':
      return { state };
    case 'skip':
      return {
        state: advance(state, state.completedInCycle, settings),
        record: interruptedRecord(state, action.now),
      };
    case 'reset':
      return {
        state: { ...state, countdown: countdown.idle(phaseDurationMs(state.phase, settings)) },
        record: interruptedRecord(state, action.now),
      };
  }
}

function withCountdown(state: PomodoroState, next: Countdown): PomodoroState {
  return next === state.countdown ? state : { ...state, countdown: next };
}

function complete(
  state: PomodoroState,
  c: Extract<Countdown, { status: 'running' }>,
  now: number,
  settings: Settings,
): Transition {
  // Use the scheduled end, not `now`: a throttled tab may tick late.
  const endedAt = c.endsAt;
  const record: SessionRecord = {
    phase: state.phase,
    startedAt: c.startedAt,
    endedAt,
    plannedMs: c.durationMs,
    actualMs: c.durationMs,
    completed: true,
  };
  const completedInCycle = state.phase === 'focus' ? state.completedInCycle + 1 : state.completedInCycle;
  const next = advance(state, completedInCycle, settings);

  const autoStart = next.phase === 'focus' ? settings.autoStartFocus : settings.autoStartBreaks;
  if (autoStart) {
    // Start seamlessly from where the last phase ended. If that phase would
    // already be over (the laptop slept through it), stay idle instead of
    // recording a session nobody was present for.
    const durationMs = next.countdown.durationMs;
    if (now < endedAt + durationMs) {
      next.countdown = { status: 'running', durationMs, startedAt: endedAt, endsAt: endedAt + durationMs };
    }
  }
  return { state: next, record };
}

/**
 * The phase that follows `phase`, given the focus count after it ended.
 * A long break comes once the cycle is full, and ending one restarts the count.
 */
export function phaseAfter(
  phase: Phase,
  completedInCycle: number,
  settings: Settings,
): { phase: Phase; completedInCycle: number } {
  if (phase === 'focus') {
    return { phase: completedInCycle >= settings.longBreakEvery ? 'longBreak' : 'shortBreak', completedInCycle };
  }
  return { phase: 'focus', completedInCycle: phase === 'longBreak' ? 0 : completedInCycle };
}

/** Move to the idle countdown of the phase after the current one. */
function advance(state: PomodoroState, completedInCycle: number, settings: Settings): PomodoroState {
  const next = phaseAfter(state.phase, completedInCycle, settings);
  return { ...next, countdown: countdown.idle(phaseDurationMs(next.phase, settings)) };
}

function interruptedRecord(state: PomodoroState, now: number): SessionRecord | undefined {
  const c = state.countdown;
  if (c.status === 'idle') return undefined;
  const actualMs = countdown.elapsedMs(c, now);
  if (actualMs < MIN_INTERRUPTED_MS) return undefined;
  return {
    phase: state.phase,
    startedAt: c.startedAt,
    endedAt: now,
    plannedMs: c.durationMs,
    actualMs,
    completed: false,
  };
}

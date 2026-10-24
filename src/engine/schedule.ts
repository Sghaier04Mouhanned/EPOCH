// Projects the next few phases with clock times, for the "Up next" list.
// Assumes each phase runs to completion from now on; pure like the rest of
// the engine.

import { remainingMs } from './countdown';
import { phaseAfter, phaseDurationMs, type Phase, type PomodoroState, type Settings } from './pomodoro';

export interface PlannedPhase {
  phase: Phase;
  durationMs: number;
  startsAt: number;
  endsAt: number;
  /** Position in the focus cycle (1-based) for focus phases. */
  focusNumber?: number;
}

export function upcoming(state: PomodoroState, settings: Settings, now: number, count: number): PlannedPhase[] {
  const c = state.countdown;
  const firstEnd = c.status === 'running' ? c.endsAt : now + remainingMs(c, now);
  const plan: PlannedPhase[] = [
    {
      phase: state.phase,
      durationMs: c.durationMs,
      startsAt: c.status === 'idle' ? now : c.startedAt,
      endsAt: firstEnd,
      focusNumber: state.phase === 'focus' ? state.completedInCycle + 1 : undefined,
    },
  ];

  let phase = state.phase;
  let done = state.completedInCycle;
  let at = firstEnd;
  while (plan.length < count) {
    if (phase === 'focus') done += 1;
    ({ phase, completedInCycle: done } = phaseAfter(phase, done, settings));
    const durationMs = phaseDurationMs(phase, settings);
    plan.push({
      phase,
      durationMs,
      startsAt: at,
      endsAt: at + durationMs,
      focusNumber: phase === 'focus' ? done + 1 : undefined,
    });
    at += durationMs;
  }
  return plan;
}

// A single countdown, driven by timestamps rather than ticks.
//
// Nothing here reads the clock: every operation takes `now` (ms since epoch).
// Remaining time is always derived from `endsAt - now`, so the countdown stays
// correct when the browser throttles timers in background tabs or the laptop
// sleeps. Values are plain JSON so they can be persisted as-is.

export type Countdown =
  | { status: 'idle'; durationMs: number }
  | { status: 'running'; durationMs: number; startedAt: number; endsAt: number }
  | { status: 'paused'; durationMs: number; startedAt: number; remainingMs: number };

export function idle(durationMs: number): Countdown {
  return { status: 'idle', durationMs };
}

export function start(c: Countdown, now: number): Countdown {
  if (c.status !== 'idle') return c;
  return { status: 'running', durationMs: c.durationMs, startedAt: now, endsAt: now + c.durationMs };
}

export function pause(c: Countdown, now: number): Countdown {
  if (c.status !== 'running') return c;
  return { status: 'paused', durationMs: c.durationMs, startedAt: c.startedAt, remainingMs: remainingMs(c, now) };
}

export function resume(c: Countdown, now: number): Countdown {
  if (c.status !== 'paused') return c;
  return { status: 'running', durationMs: c.durationMs, startedAt: c.startedAt, endsAt: now + c.remainingMs };
}

export function remainingMs(c: Countdown, now: number): number {
  switch (c.status) {
    case 'idle':
      return c.durationMs;
    case 'paused':
      return c.remainingMs;
    case 'running':
      // Clamp both ways: never negative, and never more than the full duration
      // if the system clock jumps backwards.
      return Math.min(c.durationMs, Math.max(0, c.endsAt - now));
  }
}

/** Time actually counted down so far; paused time is excluded. */
export function elapsedMs(c: Countdown, now: number): number {
  return c.durationMs - remainingMs(c, now);
}

export function isDone(c: Countdown, now: number): boolean {
  return c.status === 'running' && now >= c.endsAt;
}

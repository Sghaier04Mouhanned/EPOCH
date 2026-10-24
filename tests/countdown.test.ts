import { describe, expect, it } from 'vitest';
import { elapsedMs, idle, isDone, pause, remainingMs, resume, start } from '../src/engine/countdown';

const T0 = 1_700_000_000_000;

describe('countdown', () => {
  it('reports the full duration while idle', () => {
    expect(remainingMs(idle(60_000), T0)).toBe(60_000);
  });

  it('derives remaining time from the end timestamp', () => {
    const c = start(idle(60_000), T0);
    expect(c).toMatchObject({ status: 'running', startedAt: T0, endsAt: T0 + 60_000 });
    expect(remainingMs(c, T0 + 15_000)).toBe(45_000);
    expect(elapsedMs(c, T0 + 15_000)).toBe(15_000);
  });

  it('stays correct when ticks are skipped (throttled tab)', () => {
    const c = start(idle(60_000), T0);
    // No intermediate ticks at all; the answer only depends on `now`.
    expect(remainingMs(c, T0 + 59_000)).toBe(1_000);
    expect(isDone(c, T0 + 59_999)).toBe(false);
    expect(isDone(c, T0 + 60_000)).toBe(true);
  });

  it('clamps to zero after the end and to the duration if the clock goes backwards', () => {
    const c = start(idle(60_000), T0);
    expect(remainingMs(c, T0 + 90_000)).toBe(0);
    expect(remainingMs(c, T0 - 5_000)).toBe(60_000);
  });

  it('freezes on pause and pushes the end back on resume', () => {
    const running = start(idle(60_000), T0);
    const paused = pause(running, T0 + 20_000);
    expect(paused).toMatchObject({ status: 'paused', remainingMs: 40_000, startedAt: T0 });
    expect(remainingMs(paused, T0 + 500_000)).toBe(40_000);

    const resumed = resume(paused, T0 + 100_000);
    expect(resumed).toMatchObject({ status: 'running', startedAt: T0, endsAt: T0 + 140_000 });
    expect(elapsedMs(resumed, T0 + 110_000)).toBe(30_000);
  });

  it('ignores actions that do not apply to the current status', () => {
    const i = idle(60_000);
    expect(pause(i, T0)).toBe(i);
    expect(resume(i, T0)).toBe(i);
    const r = start(i, T0);
    expect(start(r, T0 + 1)).toBe(r);
    expect(resume(r, T0 + 1)).toBe(r);
  });
});

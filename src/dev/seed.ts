// Development helpers, loaded only by the dev server (see main.tsx).
//
//   ?at=15:20   pin the app's clock to that time today (it keeps ticking)
//   ?seed       load fixtures/sample-backup.json, moved so its last day is today
//   ?start      open with a focus session running (21:18 left), for the full-screen view
//
// The sample is written by `uv run --project tools epoch-sample`. Its wall-clock
// times are re-read in this browser's time zone, and sessions after the
// (pinned) clock are left out so "today" stops at now.

import { ACTIVE_TIMER_KEY } from '../storage/activeTimer';
import { parseBackup } from '../storage/backup';
import { openSessionRepo, toStored } from '../storage/sessions';

export async function prepare(): Promise<{ now?: () => number }> {
  const params = new URLSearchParams(location.search);

  let offset = 0;
  const at = params.get('at')?.match(/^(\d{1,2}):(\d{2})$/);
  if (at) {
    const pinned = new Date();
    pinned.setHours(Number(at[1]), Number(at[2]), 0, 0);
    offset = pinned.getTime() - Date.now();
  }
  const now = () => Date.now() + offset;

  if (params.has('seed')) {
    const { default: sample } = await import('../../fixtures/sample-backup.json');
    const parsed = parseBackup(JSON.stringify(sample));
    if (!parsed.ok) throw new Error(parsed.error);

    const last = new Date(Math.max(...parsed.sessions.map((s) => s.startedAt)));
    const lastDay = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
    const today = new Date(now());
    const local = (t: number) => {
      const d = new Date(t);
      const dayShift = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - lastDay) / 86_400_000);
      return new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + dayShift,
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds(),
        d.getUTCMilliseconds(),
      ).getTime();
    };

    const sessions = parsed.sessions
      .map(({ id: _, ...s }) => toStored({ ...s, startedAt: local(s.startedAt), endedAt: local(s.endedAt) }))
      .filter((s) => s.endedAt <= now());
    await openSessionRepo().putMany(sessions);
  }

  if (params.has('start')) {
    const durationMs = 25 * 60_000;
    const startedAt = now() - (3 * 60 + 42) * 1000;
    localStorage.setItem(
      ACTIVE_TIMER_KEY,
      JSON.stringify({
        phase: 'focus',
        completedInCycle: 0,
        countdown: { status: 'running', durationMs, startedAt, endsAt: startedAt + durationMs },
      }),
    );
  }

  return { now: offset ? now : undefined };
}

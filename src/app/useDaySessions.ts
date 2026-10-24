import { useEffect, useState } from 'react';
import { addDays, startOfDay } from '../stats/day';
import type { StoredSession } from '../storage/sessions';
import type { BrowserApp } from './browser';

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; lastGood?: T };

export interface DayHistory {
  /** Sessions that started today, oldest first. */
  today: StoredSession[];
  /** Completed-focus history far enough back to count the streak. */
  recent: StoredSession[];
}

const STREAK_WINDOW_DAYS = 366;

/** Today's sessions plus recent history, refetched whenever history changes or the day rolls over. */
export function useDaySessions(app: BrowserApp, now: number): Loadable<DayHistory> {
  const [result, setResult] = useState<Loadable<DayHistory>>({ status: 'loading' });
  const [version, setVersion] = useState(0);
  const day = startOfDay(now);

  useEffect(() => app.watchHistory(() => setVersion((v) => v + 1)), [app]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Wait for writes already under way (e.g. a session that ended while the page was closed).
        await app.store.flush();
        const recent = await app.sessions.between(addDays(day, -STREAK_WINDOW_DAYS), addDays(day, 1));
        if (cancelled) return;
        setResult({ status: 'ready', data: { today: recent.filter((s) => s.startedAt >= day), recent } });
      } catch {
        if (cancelled) return;
        setResult((prev) => ({ status: 'error', lastGood: prev.status === 'ready' ? prev.data : undefined }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, day, version]);

  return result;
}

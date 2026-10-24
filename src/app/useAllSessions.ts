import { useEffect, useState } from 'react';
import type { StoredSession } from '../storage/sessions';
import type { BrowserApp } from './browser';
import type { Loadable } from './useDaySessions';

/** The whole session history, oldest first, refetched whenever it changes in any tab. */
export function useAllSessions(app: BrowserApp): Loadable<StoredSession[]> & { reload: () => void } {
  const [result, setResult] = useState<Loadable<StoredSession[]>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => app.watchHistory(() => setVersion((v) => v + 1)), [app]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await app.store.flush();
        const all = await app.sessions.all();
        if (!cancelled) setResult({ status: 'ready', data: all });
      } catch {
        if (!cancelled) setResult((prev) => ({ status: 'error', lastGood: prev.status === 'ready' ? prev.data : undefined }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, version]);

  return { ...result, reload: () => setVersion((v) => v + 1) };
}

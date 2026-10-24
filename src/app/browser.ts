// Browser wiring for the timer store: the tick loop, catching up when the tab
// becomes visible again, and keeping several open tabs in sync.

import { ACTIVE_TIMER_KEY } from '../storage/activeTimer';
import { browserStorage } from '../storage/kv';
import { openSessionRepo, type SessionRepo } from '../storage/sessions';
import { SETTINGS_KEY } from '../storage/settings';
import { createTimerStore, type TimerStore } from './timerStore';

const TICK_MS = 250;
const CHANNEL = 'epoch';

export interface BrowserApp {
  store: TimerStore;
  sessions: SessionRepo;
  /** Call `listener` whenever session history changes in this tab or another. */
  watchHistory(listener: () => void): () => void;
}

export function createBrowserApp(now?: () => number): BrowserApp {
  const sessions = openSessionRepo();
  const store = createTimerStore({ storage: browserStorage(), sessions, now });
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(CHANNEL);

  // The timer state reaches other tabs through the `storage` event, but the
  // session write lands in IndexedDB a moment later, so announce it once done.
  store.onSessionWritten(() => channel?.postMessage('history'));

  return {
    store,
    sessions,
    watchHistory(listener) {
      const offLocal = store.onSessionWritten(listener);
      const onMessage = () => listener();
      channel?.addEventListener('message', onMessage);
      return () => {
        offLocal();
        channel?.removeEventListener('message', onMessage);
      };
    },
  };
}

/** Start ticking and listening for tab/visibility changes. Returns a cleanup function. */
export function connectBrowser(store: TimerStore): () => void {
  // Background tabs throttle this interval heavily; that is fine, because the
  // engine derives time from timestamps and the visibility handler catches up.
  const interval = window.setInterval(store.tick, TICK_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'visible') store.tick();
  };
  // `storage` fires only in *other* tabs, so there is no echo back to the writer.
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_TIMER_KEY || e.key === SETTINGS_KEY) store.reloadFromStorage();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('storage', onStorage);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('storage', onStorage);
  };
}

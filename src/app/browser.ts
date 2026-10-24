// Browser wiring for the timer store: the tick loop, catching up when the tab
// becomes visible again, and keeping several open tabs in sync.

import { ALERT_PREFS_KEY, connectAlerts, createAlertPrefs, type AlertPrefsStore } from '../alerts/browser';
import { ACTIVE_TIMER_KEY } from '../storage/activeTimer';
import { browserStorage, type KeyValueStorage } from '../storage/kv';
import { openSessionRepo, type SessionRepo } from '../storage/sessions';
import { SETTINGS_KEY } from '../storage/settings';
import { createTimerStore, type TimerStore } from './timerStore';

const TICK_MS = 250;
const CHANNEL = 'epoch';

export interface BrowserApp {
  store: TimerStore;
  sessions: SessionRepo;
  storage: KeyValueStorage;
  alertPrefs: AlertPrefsStore;
  /** Call `listener` whenever session history changes in this tab or another. */
  watchHistory(listener: () => void): () => void;
  /** Announce a change made outside the timer (an import, a delete) here and in other tabs. */
  historyChanged(): void;
}

export function createBrowserApp(now?: () => number): BrowserApp {
  const sessions = openSessionRepo();
  const storage = browserStorage();
  const store = createTimerStore({ storage, sessions, now });
  const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(CHANNEL);

  const listeners = new Set<() => void>();
  const historyChanged = () => {
    for (const l of listeners) l();
    // The timer state reaches other tabs through the `storage` event, but a
    // session write lands in IndexedDB a moment later, so announce it once done.
    channel?.postMessage('history');
  };
  store.onSessionWritten(historyChanged);

  return {
    store,
    sessions,
    storage,
    alertPrefs: createAlertPrefs(storage),
    historyChanged,
    watchHistory(listener) {
      listeners.add(listener);
      const onMessage = () => listener();
      channel?.addEventListener('message', onMessage);
      return () => {
        listeners.delete(listener);
        channel?.removeEventListener('message', onMessage);
      };
    },
  };
}

/** Start ticking, alerting and listening for tab/visibility changes. Returns a cleanup function. */
export function connectBrowser(app: BrowserApp): () => void {
  const { store } = app;
  const offAlerts = connectAlerts(store, app.alertPrefs, app.storage);
  // Background tabs throttle this interval heavily; that is fine, because the
  // engine derives time from timestamps and the visibility handler catches up.
  const interval = window.setInterval(store.tick, TICK_MS);

  const onVisibility = () => {
    if (document.visibilityState === 'visible') store.tick();
  };
  // `storage` fires only in *other* tabs, so there is no echo back to the writer.
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_TIMER_KEY || e.key === SETTINGS_KEY) store.reloadFromStorage();
    if (e.key === ALERT_PREFS_KEY) app.alertPrefs.reload();
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('storage', onStorage);
  return () => {
    offAlerts();
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('storage', onStorage);
  };
}

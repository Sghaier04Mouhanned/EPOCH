// Plays the chime and shows a notification when a phase ends, in exactly one
// of the open tabs. Preferences live in localStorage next to the timer's own.

import type { TimerStore } from '../app/timerStore';
import { isRecord, readJson, writeJson, type KeyValueStorage } from '../storage/kv';
import { sessionId } from '../storage/sessions';
import { DEFAULT_ALERT_PREFS, alertMessage, claimOnce, shouldAlert, type AlertPrefs } from './logic';

export const ALERT_PREFS_KEY = 'epoch.alerts.v1';
const BASE = import.meta.env.BASE_URL;

export function createAlertPrefs(storage: KeyValueStorage) {
  const load = (): AlertPrefs => {
    const saved = readJson(storage, ALERT_PREFS_KEY);
    const src = isRecord(saved) ? saved : {};
    return {
      sound: typeof src.sound === 'boolean' ? src.sound : DEFAULT_ALERT_PREFS.sound,
      notify: typeof src.notify === 'boolean' ? src.notify : DEFAULT_ALERT_PREFS.notify,
    };
  };
  let prefs = load();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    get: () => prefs,
    set(patch: Partial<AlertPrefs>) {
      prefs = { ...prefs, ...patch };
      writeJson(storage, ALERT_PREFS_KEY, prefs);
      emit();
    },
    /** Another tab changed them. */
    reload() {
      prefs = load();
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type AlertPrefsStore = ReturnType<typeof createAlertPrefs>;

const chimes = {
  focus: `${BASE}sounds/focus-complete.wav`,
  break: `${BASE}sounds/break-complete.wav`,
};
const players = new Map<string, HTMLAudioElement>();

/** Play a chime; false if the browser refused (no interaction with this tab yet). */
export async function playChime(kind: keyof typeof chimes): Promise<boolean> {
  let audio = players.get(kind);
  if (!audio) {
    audio = new Audio(chimes[kind]);
    audio.preload = 'auto';
    players.set(kind, audio);
  }
  audio.currentTime = 0;
  try {
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

export type NotifyStatus = 'unsupported' | NotificationPermission;

export function notifyStatus(): NotifyStatus {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

async function showNotification(title: string, body: string, silent: boolean) {
  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    silent,
    tag: 'epoch-phase', // a newer alert replaces the last one instead of stacking
    renotify: true,
    icon: `${BASE}icons/icon-192.png`,
  };
  // Through the service worker where there is one: phones only show notifications that way.
  const registration = await navigator.serviceWorker?.getRegistration();
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

export function connectAlerts(store: TimerStore, prefs: AlertPrefsStore, storage: KeyValueStorage): () => void {
  return store.onPhaseEnd(async ({ record, lateMs }) => {
    if (!shouldAlert(record, lateMs)) return;
    if (!(await claimOnce(sessionId(record), storage, navigator.locks))) return;

    const { sound, notify } = prefs.get();
    const { state, settings } = store.getSnapshot();
    const heard = sound ? await playChime(record.phase === 'focus' ? 'focus' : 'break') : false;

    // Notify when the tab is out of sight, or when the chime could not play.
    const wanted = document.visibilityState === 'hidden' || (sound && !heard);
    if (notify && wanted && notifyStatus() === 'granted') {
      const { title, body } = alertMessage(record, state, settings);
      await showNotification(title, body, heard).catch(() => undefined);
    }
  });
}

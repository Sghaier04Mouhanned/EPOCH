// Connects the pure engine to the clock and storage, and exposes the result as
// an external store (`subscribe` / `getSnapshot`) for React's
// useSyncExternalStore.
//
// Every state change is written to localStorage straight away, so a refresh,
// crash or closed tab resumes exactly where it was. Finished sessions go to
// the session repo. Clock and storage are injected, so this is tested in Node
// without a browser.

import { remainingMs } from '../engine/countdown';
import {
  applySettings,
  initialState,
  reduce,
  type Action,
  type PomodoroState,
  type SessionRecord,
  type Settings,
  type Transition,
} from '../engine/pomodoro';
import { loadActiveTimer, saveActiveTimer } from '../storage/activeTimer';
import type { KeyValueStorage } from '../storage/kv';
import { toStored, type SessionRepo } from '../storage/sessions';
import { loadSettings, sanitizeSettings, saveSettings } from '../storage/settings';

export interface TimerSnapshot {
  state: PomodoroState;
  settings: Settings;
  now: number;
}

export interface PhaseEnd {
  record: SessionRecord;
  /** How long after the scheduled end this was noticed (throttled tab, sleep). */
  lateMs: number;
}

export interface TimerStoreDeps {
  storage: KeyValueStorage;
  sessions: SessionRepo;
  now?: () => number;
  onError?: (error: unknown) => void;
}

type Command = Exclude<Action['type'], 'tick'>;

export function createTimerStore(deps: TimerStoreDeps) {
  const { storage, sessions } = deps;
  const now = deps.now ?? Date.now;
  const onError = deps.onError ?? ((e: unknown) => console.error('[epoch]', e));

  const listeners = new Set<() => void>();
  const phaseEndListeners = new Set<(e: PhaseEnd) => void>();
  const pendingWrites = new Set<Promise<void>>();

  let settings = loadSettings(storage);
  let state = applySettings(loadActiveTimer(storage) ?? initialState(settings), settings);
  let snapshot: TimerSnapshot = { state, settings, now: now() };
  let shownSecond = displayedSecond(snapshot);

  function persistSession(record: SessionRecord) {
    const write = sessions
      .put(toStored(record))
      .catch(onError)
      .finally(() => pendingWrites.delete(write));
    pendingWrites.add(write);
  }

  /** Apply a transition. Records are saved; `notify` is false only for the start-up catch-up. */
  function commit(t: Transition, at: number, notify: boolean) {
    if (t.state !== state) {
      state = t.state;
      saveActiveTimer(storage, state);
    }
    if (t.record) {
      persistSession(t.record);
      if (notify) {
        const event: PhaseEnd = { record: t.record, lateMs: Math.max(0, at - t.record.endedAt) };
        for (const l of phaseEndListeners) l(event);
      }
    }
    publish(at);
  }

  /** Emit a new snapshot only when something visible changed, at most once per displayed second. */
  function publish(at: number) {
    const next: TimerSnapshot = { state, settings, now: at };
    const second = displayedSecond(next);
    if (next.state === snapshot.state && next.settings === snapshot.settings && second === shownSecond) return;
    snapshot = next;
    shownSecond = second;
    for (const l of listeners) l();
  }

  function dispatch(type: Command | 'tick') {
    const at = now();
    commit(reduce(state, { type, now: at }, settings), at, true);
  }

  // A phase may have ended while the page was closed: record it silently.
  {
    const at = now();
    commit(reduce(state, { type: 'tick', now: at }, settings), at, false);
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    /** Fires when a phase ends while the app is open (alarm, notification). */
    onPhaseEnd(listener: (e: PhaseEnd) => void) {
      phaseEndListeners.add(listener);
      return () => void phaseEndListeners.delete(listener);
    },

    start: () => dispatch('start'),
    pause: () => dispatch('pause'),
    resume: () => dispatch('resume'),
    skip: () => dispatch('skip'),
    reset: () => dispatch('reset'),
    tick: () => dispatch('tick'),

    updateSettings(patch: Partial<Settings>) {
      settings = sanitizeSettings({ ...settings, ...patch });
      saveSettings(storage, settings);
      const next = applySettings(state, settings);
      if (next !== state) {
        state = next;
        saveActiveTimer(storage, state);
      }
      publish(now());
    },

    /** Another tab changed the saved timer or settings: adopt them without writing back. */
    reloadFromStorage() {
      settings = loadSettings(storage);
      state = applySettings(loadActiveTimer(storage) ?? state, settings);
      publish(now());
    },

    /** Resolves once every session write started so far has finished. */
    async flush() {
      await Promise.all(pendingWrites);
    },
  };
}

export type TimerStore = ReturnType<typeof createTimerStore>;

function displayedSecond({ state, now }: TimerSnapshot): number {
  return Math.ceil(remainingMs(state.countdown, now) / 1000);
}

import { describe, expect, it, vi } from 'vitest';
import { createTimerStore, type PhaseEnd } from '../src/app/timerStore';
import { memoryStorage, type KeyValueStorage } from '../src/storage/kv';
import type { SessionRepo, StoredSession } from '../src/storage/sessions';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function memoryRepo(): SessionRepo & { rows: Map<string, StoredSession> } {
  const rows = new Map<string, StoredSession>();
  return {
    rows,
    async put(s) {
      rows.set(s.id, s);
    },
    async putMany(list) {
      for (const s of list) rows.set(s.id, s);
    },
    async between(from, to) {
      return [...rows.values()].filter((s) => s.startedAt >= from && s.startedAt < to);
    },
    async all() {
      return [...rows.values()];
    },
  };
}

/** A store with a controllable clock. Pass `storage`/`sessions` to simulate a reload. */
function setup(opts: { at?: number; storage?: KeyValueStorage; sessions?: ReturnType<typeof memoryRepo> } = {}) {
  const clock = { t: opts.at ?? T0 };
  const storage = opts.storage ?? memoryStorage();
  const sessions = opts.sessions ?? memoryRepo();
  const store = createTimerStore({ storage, sessions, now: () => clock.t });
  return { store, clock, storage, sessions };
}

describe('timer store', () => {
  it('resumes a running timer after a page reload', () => {
    const first = setup();
    first.store.start();

    const reloaded = setup({ at: T0 + 10 * MIN, storage: first.storage, sessions: first.sessions });
    expect(reloaded.store.getSnapshot().state.countdown).toEqual({
      status: 'running',
      durationMs: 25 * MIN,
      startedAt: T0,
      endsAt: T0 + 25 * MIN,
    });
  });

  it('records a phase that finished while the page was closed, without firing an alarm', async () => {
    const first = setup();
    first.store.start();

    const reopened = setup({ at: T0 + 2 * 60 * MIN, storage: first.storage, sessions: first.sessions });
    const alarm = vi.fn();
    reopened.store.onPhaseEnd(alarm);
    await reopened.store.flush();

    expect(reopened.store.getSnapshot().state.phase).toBe('shortBreak');
    expect([...first.sessions.rows.values()]).toMatchObject([{ phase: 'focus', completed: true, endedAt: T0 + 25 * MIN }]);
    expect(alarm).not.toHaveBeenCalled();
  });

  it('fires onPhaseEnd with how late the end was noticed', async () => {
    const { store, clock, sessions } = setup();
    const events: PhaseEnd[] = [];
    store.onPhaseEnd((e) => events.push(e));

    store.start();
    clock.t = T0 + 25 * MIN + 40_000; // throttled background tab
    store.tick();
    await store.flush();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ lateMs: 40_000, record: { phase: 'focus', completed: true } });
    expect(sessions.rows.size).toBe(1);
  });

  it('notifies subscribers once per displayed second, not on every tick', () => {
    const { store, clock } = setup();
    store.start();
    const listener = vi.fn();
    store.subscribe(listener);

    for (let ms = 0; ms <= 2_000; ms += 250) {
      clock.t = T0 + ms;
      store.tick();
    }
    // 9 ticks, but the displayed time only changes at +1s (25:00 → 24:59) and +2s.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the snapshot reference stable when nothing changed', () => {
    const { store } = setup();
    const before = store.getSnapshot();
    store.tick();
    store.pause(); // no-op while idle
    expect(store.getSnapshot()).toBe(before);
  });

  it('saves settings and applies them to an idle timer', () => {
    const first = setup();
    first.store.updateSettings({ focusMinutes: 50 });
    expect(first.store.getSnapshot().state.countdown).toEqual({ status: 'idle', durationMs: 50 * MIN });

    const reloaded = setup({ storage: first.storage });
    expect(reloaded.store.getSnapshot().settings.focusMinutes).toBe(50);
    expect(reloaded.store.getSnapshot().state.countdown.durationMs).toBe(50 * MIN);
  });

  it('rejects invalid settings values', () => {
    const { store } = setup();
    store.updateSettings({ focusMinutes: -5 });
    expect(store.getSnapshot().settings.focusMinutes).toBe(25);
  });

  it('adopts changes made in another tab', () => {
    const storage = memoryStorage();
    const sessions = memoryRepo();
    const tabA = setup({ storage, sessions });
    const tabB = setup({ storage, sessions });

    tabA.store.start();
    tabB.store.reloadFromStorage(); // what the `storage` event triggers
    expect(tabB.store.getSnapshot().state.countdown.status).toBe('running');
  });

  it('writes each finished session once even if two tabs both notice it', async () => {
    const storage = memoryStorage();
    const sessions = memoryRepo();
    const tabA = setup({ storage, sessions });
    const tabB = setup({ storage, sessions });
    tabA.store.start();
    tabB.store.reloadFromStorage();

    tabA.clock.t = tabB.clock.t = T0 + 25 * MIN;
    tabA.store.tick();
    tabB.store.tick();
    await Promise.all([tabA.store.flush(), tabB.store.flush()]);
    expect(sessions.rows.size).toBe(1);
  });

  it('keeps running when session storage fails', async () => {
    const onError = vi.fn();
    const failing: SessionRepo = { ...memoryRepo(), put: () => Promise.reject(new Error('quota')) };
    const clock = { t: T0 };
    const store = createTimerStore({ storage: memoryStorage(), sessions: failing, now: () => clock.t, onError });

    store.start();
    clock.t = T0 + 25 * MIN;
    store.tick();
    await store.flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(store.getSnapshot().state.phase).toBe('shortBreak');
  });
});

describe('timer store while idle', () => {
  it('still publishes once a minute so clock times stay current', () => {
    const { store, clock } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    const nextMinute = Math.ceil((T0 + 1) / MIN) * MIN;
    clock.t = nextMinute - 1;
    store.tick();
    expect(listener).not.toHaveBeenCalled();
    clock.t = nextMinute;
    store.tick();
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getSnapshot().now).toBe(nextMinute);
  });
});

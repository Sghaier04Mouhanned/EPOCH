import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, initialState, reduce, type SessionRecord } from '../src/engine/pomodoro';
import { ACTIVE_TIMER_KEY, loadActiveTimer, saveActiveTimer } from '../src/storage/activeTimer';
import { buildBackup, importSessions, parseBackup } from '../src/storage/backup';
import { memoryRepo } from './helpers';
import { memoryStorage } from '../src/storage/kv';
import { sessionId, toStored } from '../src/storage/sessions';
import { SETTINGS_KEY, loadSettings, sanitizeSettings, saveSettings } from '../src/storage/settings';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe('settings', () => {
  it('uses defaults when nothing is saved or the value is unreadable', () => {
    const s = memoryStorage();
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    s.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips', () => {
    const s = memoryStorage();
    const custom = { ...DEFAULT_SETTINGS, focusMinutes: 50, autoStartBreaks: true };
    saveSettings(s, custom);
    expect(loadSettings(s)).toEqual(custom);
  });

  it('replaces only the invalid fields with defaults', () => {
    expect(
      sanitizeSettings({ focusMinutes: 40, shortBreakMinutes: 0, longBreakMinutes: 'x', longBreakEvery: 2.5, autoStartFocus: 1 }),
    ).toEqual({ ...DEFAULT_SETTINGS, focusMinutes: 40 });
  });
});

describe('active timer', () => {
  it('round-trips a running timer', () => {
    const s = memoryStorage();
    const running = reduce(initialState(DEFAULT_SETTINGS), { type: 'start', now: T0 }, DEFAULT_SETTINGS).state;
    saveActiveTimer(s, running);
    expect(loadActiveTimer(s)).toEqual(running);
  });

  it.each([
    ['corrupt JSON', '{"phase":'],
    ['unknown phase', JSON.stringify({ phase: 'nap', completedInCycle: 0, countdown: { status: 'idle', durationMs: 1 } })],
    ['missing endsAt', JSON.stringify({ phase: 'focus', completedInCycle: 0, countdown: { status: 'running', durationMs: 1, startedAt: 0 } })],
    ['negative cycle', JSON.stringify({ phase: 'focus', completedInCycle: -1, countdown: { status: 'idle', durationMs: 1 } })],
  ])('ignores a saved value with %s', (_, raw) => {
    const s = memoryStorage();
    s.setItem(ACTIVE_TIMER_KEY, raw);
    expect(loadActiveTimer(s)).toBeUndefined();
  });
});

describe('backup', () => {
  const record: SessionRecord = {
    phase: 'focus',
    startedAt: T0,
    endedAt: T0 + 25 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 25 * MIN,
    completed: true,
  };

  it('round-trips settings and sessions', () => {
    const backup = buildBackup(DEFAULT_SETTINGS, [toStored(record)], T0);
    expect(backup.exportedAt).toBe(new Date(T0).toISOString());
    expect(parseBackup(JSON.stringify(backup))).toEqual({
      ok: true,
      settings: DEFAULT_SETTINGS,
      sessions: [toStored(record)],
      skipped: 0,
    });
  });

  it('skips invalid sessions, drops unknown fields and recomputes ids', () => {
    const file = {
      app: 'epoch',
      version: 1,
      settings: {},
      sessions: [{ ...record, id: 'tampered', extra: true }, { ...record, endedAt: T0 - 1 }, 'junk'],
    };
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed).toMatchObject({ ok: true, skipped: 2 });
    if (parsed.ok) expect(parsed.sessions).toEqual([{ id: sessionId(record), ...record }]);
  });

  it.each([
    ['not JSON', 'nope', 'not valid JSON'],
    ['another app', JSON.stringify({ app: 'other', version: 1, sessions: [] }), 'not an Epoch backup'],
    ['a future version', JSON.stringify({ app: 'epoch', version: 9, sessions: [] }), 'Unsupported backup version'],
    ['no sessions', JSON.stringify({ app: 'epoch', version: 1 }), 'no session list'],
  ])('rejects %s', (_, text, message) => {
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toContain(message);
  });
});

describe('importSessions', () => {
  const rec = (startedAt: number): SessionRecord => ({
    phase: 'focus',
    startedAt,
    endedAt: startedAt + 25 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 25 * MIN,
    completed: true,
  });

  it('adds new sessions, counts the ones already there and never doubles them', async () => {
    const repo = memoryRepo();
    await repo.put(toStored(rec(T0)));
    const result = await importSessions(repo, [toStored(rec(T0)), toStored(rec(T0 + 30 * MIN))]);
    expect(result).toEqual({ added: 1, alreadyHere: 1 });
    expect(repo.rows.size).toBe(2);
  });
});

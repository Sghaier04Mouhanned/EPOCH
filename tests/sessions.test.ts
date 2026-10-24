// Must be imported before Dexie so it picks up the in-memory IndexedDB.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../src/engine/pomodoro';
import { openSessionRepo, toStored } from '../src/storage/sessions';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
let dbCount = 0;
const freshRepo = () => openSessionRepo(`test-${++dbCount}`);

function focus(startedAt: number, completed = true): SessionRecord {
  return { phase: 'focus', startedAt, endedAt: startedAt + 25 * MIN, plannedMs: 25 * MIN, actualMs: 25 * MIN, completed };
}

describe('session repo', () => {
  it('stores the same session only once, however often it is written', async () => {
    const repo = freshRepo();
    await repo.put(toStored(focus(T0)));
    await repo.put(toStored(focus(T0)));
    await repo.putMany([toStored(focus(T0)), toStored(focus(T0 + 30 * MIN))]);
    expect(await repo.all()).toHaveLength(2);
  });

  it('returns sessions in a half-open time range, oldest first', async () => {
    const repo = freshRepo();
    const starts = [T0 + 60 * MIN, T0, T0 + 30 * MIN, T0 + 90 * MIN];
    await repo.putMany(starts.map((s) => toStored(focus(s))));
    const found = await repo.between(T0, T0 + 90 * MIN);
    expect(found.map((s) => s.startedAt)).toEqual([T0, T0 + 30 * MIN, T0 + 60 * MIN]);
  });

  it('clears every session', async () => {
    const repo = freshRepo();
    await repo.putMany([toStored(focus(T0)), toStored(focus(T0 + 30 * MIN))]);
    await repo.clear();
    expect(await repo.all()).toEqual([]);
  });

  it('lets a later write replace an earlier one for the same session', async () => {
    const repo = freshRepo();
    await repo.put(toStored(focus(T0, false)));
    await repo.put(toStored(focus(T0, true)));
    const [only] = await repo.all();
    expect(only?.completed).toBe(true);
  });
});

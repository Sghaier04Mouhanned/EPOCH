import type { SessionRepo, StoredSession } from '../src/storage/sessions';

/** An in-memory SessionRepo, with its rows exposed for assertions. */
export function memoryRepo(): SessionRepo & { rows: Map<string, StoredSession> } {
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
    async clear() {
      rows.clear();
    },
  };
}

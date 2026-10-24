// Session history in IndexedDB (via Dexie).
//
// Each session's id is derived from its content (start time + phase), so
// writing the same session twice is a no-op. That makes two open tabs, a
// catch-up after reopening, and re-importing a backup all safe to repeat.

import { Dexie, type EntityTable } from 'dexie';
import type { SessionRecord } from '../engine/pomodoro';
import { isPhase } from './activeTimer';
import { isFiniteNumber, isRecord } from './kv';

export interface StoredSession extends SessionRecord {
  id: string;
}

export function sessionId(record: SessionRecord): string {
  return `${record.startedAt}-${record.phase}`;
}

export function toStored(record: SessionRecord): StoredSession {
  return { id: sessionId(record), ...record };
}

export function isSessionRecord(x: unknown): x is SessionRecord {
  return (
    isRecord(x) &&
    isPhase(x.phase) &&
    isFiniteNumber(x.startedAt) &&
    isFiniteNumber(x.endedAt) &&
    x.endedAt >= x.startedAt &&
    isFiniteNumber(x.plannedMs) &&
    x.plannedMs > 0 &&
    isFiniteNumber(x.actualMs) &&
    x.actualMs >= 0 &&
    typeof x.completed === 'boolean'
  );
}

export interface SessionRepo {
  put(session: StoredSession): Promise<void>;
  putMany(sessions: StoredSession[]): Promise<void>;
  /** Sessions that started in [from, to), oldest first. */
  between(from: number, to: number): Promise<StoredSession[]>;
  all(): Promise<StoredSession[]>;
  /** Permanently delete every session. */
  clear(): Promise<void>;
}

type SessionDb = Dexie & { sessions: EntityTable<StoredSession, 'id'> };

export function openSessionRepo(name = 'epoch'): SessionRepo {
  const db = new Dexie(name) as SessionDb;
  db.version(1).stores({ sessions: 'id, startedAt' });

  return {
    async put(session) {
      await db.sessions.put(session);
    },
    async putMany(sessions) {
      await db.sessions.bulkPut(sessions);
    },
    between(from, to) {
      return db.sessions.where('startedAt').between(from, to, true, false).toArray();
    },
    all() {
      return db.sessions.orderBy('startedAt').toArray();
    },
    async clear() {
      await db.sessions.clear();
    },
  };
}

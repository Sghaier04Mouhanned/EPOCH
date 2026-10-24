// JSON backup format. History lives in one browser only, so export/import is
// how it moves between devices or survives clearing site data. The Python
// stats CLI in tools/ reads the same format.

import type { Settings } from '../engine/pomodoro';
import { isRecord } from './kv';
import { isSessionRecord, toStored, type StoredSession } from './sessions';
import { sanitizeSettings } from './settings';

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'epoch';
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  settings: Settings;
  sessions: StoredSession[];
}

export type ParsedBackup =
  | { ok: true; settings: Settings; sessions: StoredSession[]; skipped: number }
  | { ok: false; error: string };

export function buildBackup(settings: Settings, sessions: StoredSession[], now: number): Backup {
  return { app: 'epoch', version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), settings, sessions };
}

/**
 * Validate an imported file. Unreadable sessions are skipped and counted
 * rather than failing the whole import; ids are recomputed, so a hand-edited
 * file can't create duplicates.
 */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!isRecord(data) || data.app !== 'epoch') {
    return { ok: false, error: 'This is not an Epoch backup.' };
  }
  if (data.version !== BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version: ${String(data.version)}.` };
  }
  if (!Array.isArray(data.sessions)) {
    return { ok: false, error: 'The backup has no session list.' };
  }
  const valid = data.sessions.filter(isSessionRecord);
  const sessions = valid.map(({ phase, startedAt, endedAt, plannedMs, actualMs, completed }) =>
    toStored({ phase, startedAt, endedAt, plannedMs, actualMs, completed }),
  );
  return {
    ok: true,
    settings: sanitizeSettings(data.settings),
    sessions,
    skipped: data.sessions.length - valid.length,
  };
}

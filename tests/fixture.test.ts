// Contract between the Python sample generator (tools/) and the app: every
// session it writes must pass the app's own backup validation.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SessionRecord } from '../src/engine/pomodoro';
import { parseBackup } from '../src/storage/backup';
import { sessionId } from '../src/storage/sessions';

const text = readFileSync(new URL('../fixtures/sample-backup.json', import.meta.url), 'utf8');

describe('fixtures/sample-backup.json', () => {
  it('is accepted in full by the app', () => {
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toBe(0);
    expect(parsed.sessions.length).toBeGreaterThan(100);
  });

  it('uses the same session ids as the app', () => {
    const raw = JSON.parse(text) as { sessions: (SessionRecord & { id: string })[] };
    for (const s of raw.sessions) expect(s.id).toBe(sessionId(s));
  });
});

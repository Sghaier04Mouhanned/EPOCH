// The Content Security Policy in public/_headers allows index.html's inline
// theme script by its hash. If the script changes and the hash does not, the
// live site would silently block it, so the build must fail here instead.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('security headers', () => {
  const html = read('index.html');
  const headers = read('public/_headers');
  const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? '';

  it('allows exactly the inline scripts index.html has, by hash', () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
    expect(inline).toHaveLength(1);
    const hash = `'sha256-${createHash('sha256').update(inline[0]!, 'utf8').digest('base64')}'`;
    expect(csp).toContain(`script-src 'self' ${hash};`);
  });

  it('allows nothing from other origins', () => {
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).not.toMatch(/https?:/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
  });
});

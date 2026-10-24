import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../src/ui/theme';

describe('resolveTheme', () => {
  it('follows the device when set to system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  it('keeps a pinned choice whatever the device says', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });
});

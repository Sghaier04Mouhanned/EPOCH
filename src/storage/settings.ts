import { DEFAULT_SETTINGS, type Settings } from '../engine/pomodoro';
import { isRecord, readJson, writeJson, type KeyValueStorage } from './kv';

export const SETTINGS_KEY = 'epoch.settings.v1';

const LIMITS = {
  focusMinutes: [1, 180],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 90],
  longBreakEvery: [1, 12],
} as const satisfies Partial<Record<keyof Settings, readonly [number, number]>>;

/**
 * Coerce anything into valid settings. Each field is checked on its own, so
 * one bad value (an old version, a hand-edited backup) falls back to its
 * default without discarding the rest.
 */
export function sanitizeSettings(input: unknown): Settings {
  const src = isRecord(input) ? input : {};
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const [min, max] = LIMITS[key];
    const v = src[key];
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) out[key] = v;
  }
  if (typeof src.autoStartBreaks === 'boolean') out.autoStartBreaks = src.autoStartBreaks;
  if (typeof src.autoStartFocus === 'boolean') out.autoStartFocus = src.autoStartFocus;
  return out;
}

export function loadSettings(storage: KeyValueStorage): Settings {
  return sanitizeSettings(readJson(storage, SETTINGS_KEY));
}

export function saveSettings(storage: KeyValueStorage, settings: Settings): void {
  writeJson(storage, SETTINGS_KEY, settings);
}

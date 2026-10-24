// Light or dark, chosen in Settings: follow the system (default), or pin one.
// The choice is a per-device convenience in localStorage. index.html applies
// it before the first paint with the same rules, so there is no flash.

export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'epoch.theme.v1';
const META_COLOUR = { light: '#f0f1f3', dark: '#010102' } as const; // each theme's --ground

const systemLight = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches;

function read(): ThemePref {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(pref: ThemePref, prefersLight: boolean): 'light' | 'dark' {
  return pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref;
}

function apply(pref: ThemePref) {
  const theme = resolveTheme(pref, systemLight());
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOUR[theme]);
}

function createThemeStore() {
  let pref = read();
  const listeners = new Set<() => void>();
  const changed = () => {
    apply(pref);
    listeners.forEach((l) => l());
  };

  if (typeof window !== 'undefined') {
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (pref === 'system') changed();
    });
    // Another tab changed the choice.
    window.addEventListener('storage', (e) => {
      if (e.key === THEME_KEY) {
        pref = read();
        changed();
      }
    });
  }

  return {
    get: () => pref,
    set(next: ThemePref) {
      pref = next;
      try {
        if (next === 'system') localStorage.removeItem(THEME_KEY);
        else localStorage.setItem(THEME_KEY, next);
      } catch {
        // Still applies for this visit.
      }
      changed();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const themeStore = createThemeStore();

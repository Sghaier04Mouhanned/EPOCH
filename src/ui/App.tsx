import { useEffect, useSyncExternalStore } from 'react';
import { remainingMs } from '../engine/countdown';
import type { BrowserApp } from '../app/browser';
import { useTimer } from '../app/useTimer';
import { PHASE_LABEL, formatCountdown } from './format';
import { TimerScreen } from './TimerScreen';

type Route = 'timer' | 'stats' | 'settings';

const ROUTES: { id: Route; label: string; href: string }[] = [
  { id: 'timer', label: 'Timer', href: '#/' },
  { id: 'stats', label: 'Stats', href: '#/stats' },
  { id: 'settings', label: 'Settings', href: '#/settings' },
];

function readRoute(): Route {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash === 'stats' || hash === 'settings' ? hash : 'timer';
}

function useRoute(): Route {
  return useSyncExternalStore((cb) => {
    window.addEventListener('hashchange', cb);
    return () => window.removeEventListener('hashchange', cb);
  }, readRoute);
}

export function App({ app }: { app: BrowserApp }) {
  const snapshot = useTimer(app.store);
  const route = useRoute();
  const { state, now } = snapshot;

  // The tab title carries the countdown, so it can be read from another tab.
  useEffect(() => {
    document.title =
      state.countdown.status === 'idle'
        ? 'Epoch'
        : `${formatCountdown(remainingMs(state.countdown, now))} · ${PHASE_LABEL[state.phase]} · Epoch`;
  }, [state, now]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="wordmark" href="#/">
            <Mark />
            Epoch
          </a>
          <nav aria-label="Main">
            {ROUTES.map((r) => (
              <a key={r.id} href={r.href} aria-current={route === r.id ? 'page' : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="canvas">
        {route === 'timer' && <TimerScreen app={app} snapshot={snapshot} />}
        {route === 'stats' && (
          <ComingNext title="Stats" text="Daily totals, streaks and when you focus best are being built next." />
        )}
        {route === 'settings' && (
          <ComingNext
            title="Settings"
            text="Session lengths, auto-start and backup export arrive with the next update. Defaults: 25 m focus, 5 m short break, 15 m long break every 4 sessions."
          />
        )}
      </main>
    </>
  );
}

function ComingNext({ title, text }: { title: string; text: string }) {
  return (
    <>
      <header className="title-row">
        <h1>{title}</h1>
      </header>
      <section className="panel">
        <p className="empty">{text}</p>
      </section>
    </>
  );
}

/** A ring with a quarter elapsed: the product's mark. */
function Mark() {
  return (
    <svg className="mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7" fill="none" stroke="var(--raised-2)" strokeWidth="2.5" />
      <path d="M9 2 A7 7 0 0 1 16 9" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

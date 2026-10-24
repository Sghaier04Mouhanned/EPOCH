// Placeholder screen for exercising the timer store. The designed UI replaces
// this in step 3; only the `useTimer` wiring carries over.

import { remainingMs } from './engine/countdown';
import type { TimerStore } from './app/timerStore';
import { useTimer } from './app/useTimer';

function format(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function App({ store }: { store: TimerStore }) {
  const { state, now } = useTimer(store);
  const { status } = state.countdown;

  return (
    <main style={{ minHeight: '100vh', background: '#010102', color: '#f7f8f8', display: 'grid', placeContent: 'center', gap: 16, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <p data-testid="phase">{state.phase} · {status} · cycle {state.completedInCycle}</p>
      <p data-testid="time" style={{ fontSize: 64, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
        {format(remainingMs(state.countdown, now))}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        {status === 'idle' && <button onClick={store.start}>Start</button>}
        {status === 'running' && <button onClick={store.pause}>Pause</button>}
        {status === 'paused' && <button onClick={store.resume}>Resume</button>}
        <button onClick={store.skip}>Skip</button>
        <button onClick={store.reset}>Reset</button>
      </div>
    </main>
  );
}
